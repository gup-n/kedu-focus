package com.gupn.kedu.focus;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
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
        postNotification(title, body);
        call.resolve();
    }

    @PermissionCallback
    public void notificationsPermissionsCallback(PluginCall call) {
        if (getPermissionState("notifications") == com.getcapacitor.PermissionState.GRANTED) {
            postNotification(call.getString("title", "专注完成"), call.getString("body", "计时仍在继续。"));
            call.resolve();
        } else {
            call.reject("通知权限未授予");
        }
    }

    private void postNotification(String title, String body) {
        NotificationCompat.Builder builder = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
            .setSmallIcon(com.gupn.kedu.focus.R.mipmap.ic_launcher)
            .setContentTitle(title).setContentText(body).setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true).setVibrate(new long[]{0, 220, 100, 220});
        NotificationManagerCompat.from(getContext()).notify(2501, builder.build());
    }
}
