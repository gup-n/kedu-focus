package com.gupn.kedu.focus;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;
import org.json.JSONObject;

@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {
    private static final String APK_NAME = "kedu-update.apk";
    private static final String TEMP_NAME = "kedu-update.apk.part";
    private volatile Thread downloadThread;
    private volatile boolean cancelRequested;
    private volatile JSObject latestState = state("idle", "", 0, null, null);

    @PluginMethod
    public void startDownload(PluginCall call) {
        String url = call.getString("url");
        String version = call.getString("version");
        if (url == null || url.isEmpty() || version == null || version.isEmpty()) {
            call.reject("下载地址和版本号不能为空");
            return;
        }
        if (downloadThread != null && downloadThread.isAlive()) {
            call.reject("已有 APK 正在下载");
            return;
        }
        cancelRequested = false;
        downloadThread = new Thread(() -> download(call, url, version), "kedu-apk-download");
        downloadThread.start();
    }

    @PluginMethod
    public void getDownloadStatus(PluginCall call) {
        if ("idle".equals(latestState.optString("state", "idle"))) restoreSavedDownload();
        call.resolve(latestState);
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        cancelRequested = true;
        Thread thread = downloadThread;
        if (thread != null) thread.interrupt();
        File temp = new File(getContext().getCacheDir(), TEMP_NAME);
        if (temp.exists()) temp.delete();
        latestState = state("cancelled", latestState.optString("version", ""), 0, null, "用户取消下载");
        notifyListeners("progress", latestState);
        call.resolve(latestState);
    }

    @PluginMethod
    public void installDownloaded(PluginCall call) {
        File apk = new File(getContext().getCacheDir(), APK_NAME);
        if (!apk.exists()) {
            call.resolve(installResult("not-ready"));
            return;
        }
        try {
            validateApk(apk, latestState.optString("version", ""));
        } catch (Exception reason) {
            apk.delete();
            latestState = state("failed", latestState.optString("version", ""), 0, null, reason.getMessage());
            notifyListeners("progress", latestState);
            call.resolve(installResult("not-ready"));
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent permission = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            permission.setData(Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(permission);
            call.resolve(installResult("permission-required"));
            return;
        }
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getActivity().startActivity(intent);
        latestState = state("installing", latestState.optString("version", ""), latestState.optLong("downloadedBytes", 0), latestState.optLong("totalBytes", 0), null);
        notifyListeners("progress", latestState);
        call.resolve(installResult("started"));
    }

    @PluginMethod
    public void canInstallPackages(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls());
        call.resolve(result);
    }

    private void download(PluginCall call, String sourceUrl, String version) {
        HttpURLConnection connection = null;
        File temp = new File(getContext().getCacheDir(), TEMP_NAME);
        File target = new File(getContext().getCacheDir(), APK_NAME);
        try {
            latestState = state("checking", version, 0, null, null);
            notifyListeners("progress", latestState);
            connection = (HttpURLConnection) new URL(sourceUrl).openConnection();
            connection.setInstanceFollowRedirects(true);
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(60000);
            connection.setRequestMethod("GET");
            connection.connect();
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new IllegalStateException("APK 下载失败（HTTP " + status + "）");
            long total = connection.getContentLengthLong() > 0 ? connection.getContentLengthLong() : -1;
            long downloaded = 0;
            try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(temp, false)) {
                byte[] buffer = new byte[8192];
                int read;
                latestState = state("downloading", version, 0, total, null);
                notifyListeners("progress", latestState);
                while ((read = input.read(buffer)) != -1) {
                    if (cancelRequested || Thread.currentThread().isInterrupted()) throw new InterruptedException();
                    output.write(buffer, 0, read);
                    downloaded += read;
                    latestState = state("downloading", version, downloaded, total, null);
                    notifyListeners("progress", latestState);
                }
            }
            if (target.exists()) target.delete();
            if (!temp.renameTo(target)) throw new IllegalStateException("无法保存 APK 文件");
            validateApk(target, version);
            latestState = state("ready", version, target.length(), total, null);
            notifyListeners("progress", latestState);
            call.resolve(latestState);
        } catch (InterruptedException reason) {
            latestState = state("cancelled", version, 0, null, "用户取消下载");
            notifyListeners("progress", latestState);
            call.resolve(latestState);
        } catch (Exception reason) {
            if (temp.exists()) temp.delete();
            if (target.exists() && !isValidApk(target, version)) target.delete();
            latestState = state("failed", version, 0, null, reason.getMessage() == null ? "APK 下载失败" : reason.getMessage());
            notifyListeners("progress", latestState);
            call.reject(latestState.optString("error", "APK 下载失败"));
        } finally {
            if (connection != null) connection.disconnect();
            downloadThread = null;
        }
    }

    private void validateApk(File apk, String expectedVersion) throws Exception {
        PackageManager manager = getContext().getPackageManager();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo archive = manager.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
        if (archive == null || !getContext().getPackageName().equals(archive.packageName)) throw new IllegalStateException("APK 包名不匹配");
        if (expectedVersion != null && !expectedVersion.isEmpty() && !expectedVersion.equals(archive.versionName)) throw new IllegalStateException("APK 版本与更新公告不匹配");
        long installedVersion = versionCode(manager.getPackageInfo(getContext().getPackageName(), flags));
        long downloadedVersion = versionCode(archive);
        if (downloadedVersion <= installedVersion) throw new IllegalStateException("APK 版本不高于当前版本");
        if (!sameSignature(manager.getPackageInfo(getContext().getPackageName(), flags), archive)) throw new IllegalStateException("APK 签名与当前应用不匹配");
    }

    private boolean isValidApk(File apk, String expectedVersion) {
        try { validateApk(apk, expectedVersion); return true; } catch (Exception ignored) { return false; }
    }

    private void restoreSavedDownload() {
        File apk = new File(getContext().getCacheDir(), APK_NAME);
        if (!apk.exists()) return;
        try {
            PackageInfo archive = getContext().getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), 0);
            if (archive != null && isValidApk(apk, archive.versionName)) latestState = state("ready", archive.versionName, apk.length(), apk.length(), null);
            else apk.delete();
        } catch (Exception ignored) {}
    }

    private long versionCode(PackageInfo info) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
    }

    private boolean sameSignature(PackageInfo installed, PackageInfo archive) throws Exception {
        byte[] left = signatureBytes(installed);
        byte[] right = signatureBytes(archive);
        return left != null && right != null && Arrays.equals(left, right);
    }

    private byte[] signatureBytes(PackageInfo info) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && info.signingInfo != null) {
            android.content.pm.Signature[] signatures = info.signingInfo.hasMultipleSigners() ? info.signingInfo.getApkContentsSigners() : info.signingInfo.getSigningCertificateHistory();
            if (signatures != null && signatures.length > 0) return MessageDigest.getInstance("SHA-256").digest(signatures[0].toByteArray());
        }
        if (info.signatures != null && info.signatures.length > 0) return MessageDigest.getInstance("SHA-256").digest(info.signatures[0].toByteArray());
        return null;
    }

    private JSObject state(String value, String version, long downloaded, Long total, String error) {
        JSObject result = new JSObject();
        result.put("state", value);
        result.put("version", version);
        result.put("downloadedBytes", downloaded);
        result.put("totalBytes", total == null || total < 0 ? JSONObject.NULL : total);
        result.put("percent", total == null || total <= 0 ? JSONObject.NULL : Math.min(100, Math.round(downloaded * 100d / total)));
        if (error != null) result.put("error", error);
        return result;
    }

    private JSObject installResult(String status) {
        JSObject result = new JSObject();
        result.put("status", status);
        return result;
    }
}
