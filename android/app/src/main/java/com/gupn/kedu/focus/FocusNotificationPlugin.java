package com.gupn.kedu.focus;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(name = "FocusNotification", permissions = {
    @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
})
public class FocusNotificationPlugin extends Plugin {
    private static final String CHANNEL_ID = "focus-complete";
    private static final int RUNNING_NOTIFICATION_ID = 2502;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable thresholdReminder = () -> postNotification("专注已满 25 分钟", "计时仍在继续，结束时会按实际时长记录。", true);
    private boolean pendingRunning;
    private String pendingTitle;
    private String pendingBody;

    @PluginMethod
    public void startFocus(PluginCall call) {
        String title = call.getString("title", "正在专注");
        String body = call.getString("body", "计时进行中");
        ensurePermission(call, title, body, true);
    }

    @PluginMethod
    public void stopFocus(PluginCall call) {
        handler.removeCallbacks(thresholdReminder);
        NotificationManagerCompat.from(getContext()).cancel(RUNNING_NOTIFICATION_ID);
        call.resolve();
    }

    @PluginMethod
    public void updateFocus(PluginCall call) {
        String title = call.getString("title", "正在专注");
        String body = call.getString("body", "计时进行中");
        postNotification(title, body, false);
        call.resolve();
    }

    @PluginMethod
    public void notify(PluginCall call) {
        String title = call.getString("title", "专注完成");
        String body = call.getString("body", "计时仍在继续。");
        NotificationManager manager = (NotificationManager) getContext().getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "专注提醒", NotificationManager.IMPORTANCE_HIGH));
        }
        if (Build.VERSION.SDK_INT >= 33 && getContext().checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationsPermissionsCallback");
            return;
        }
        postNotification(title, body, true);
        call.resolve();
    }

    @PermissionCallback
    public void notificationsPermissionsCallback(PluginCall call) {
        if (getPermissionState("notifications") == com.getcapacitor.PermissionState.GRANTED) {
            String title = pendingTitle != null ? pendingTitle : call.getString("title", "专注完成");
            String body = pendingBody != null ? pendingBody : call.getString("body", "计时仍在继续。");
            boolean running = pendingRunning;
            pendingTitle = null;
            pendingBody = null;
            pendingRunning = false;
            postNotification(title, body, !running);
            if (running) handler.postDelayed(thresholdReminder, 25 * 60 * 1000L);
            call.resolve();
        } else {
            call.reject("通知权限未授予");
        }
    }

    private void postNotification(String title, String body, boolean autoCancel) {
        NotificationCompat.Builder builder = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
            .setSmallIcon(com.gupn.kedu.focus.R.mipmap.ic_launcher)
            .setContentTitle(title).setContentText(body).setPriority(NotificationCompat.PRIORITY_HIGH)
            .setOngoing(!autoCancel).setAutoCancel(autoCancel).setVibrate(new long[]{0, 220, 100, 220});
        NotificationManagerCompat.from(getContext()).notify(autoCancel ? 2501 : RUNNING_NOTIFICATION_ID, builder.build());
    }

    private void ensurePermission(PluginCall call, String title, String body, boolean running) {
        NotificationManager manager = (NotificationManager) getContext().getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "专注提醒", NotificationManager.IMPORTANCE_HIGH));
        }
        if (Build.VERSION.SDK_INT >= 33 && getContext().checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            pendingRunning = running;
            pendingTitle = title;
            pendingBody = body;
            requestPermissionForAlias("notifications", call, "notificationsPermissionsCallback");
            return;
        }
        postNotification(title, body, !running);
        if (running) {
            handler.removeCallbacks(thresholdReminder);
            handler.postDelayed(thresholdReminder, 25 * 60 * 1000L);
        }
        call.resolve();
    }
}
