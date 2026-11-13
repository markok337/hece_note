package io.github.markok337.hecenote;

import android.Manifest;
import android.database.Cursor;
import android.net.Uri;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONException;

import java.util.HashSet;
import java.util.Set;

/**
 * 폰의 받은 문자함에서 등록한 발신번호의 문자만 읽어 앱에 넘긴다.
 * 다른 번호의 문자는 조회 결과에서 곧바로 버리고 앱에 넘기지 않는다. 문자를 보내거나 지우지는 않는다.
 */
@CapacitorPlugin(
    name = "SmsInbox",
    permissions = { @Permission(alias = "sms", strings = { Manifest.permission.READ_SMS }) }
)
public class SmsInboxPlugin extends Plugin {

    private static final Uri INBOX = Uri.parse("content://sms/inbox");

    /** 권한 상태만 알려 준다. */
    @PluginMethod
    public void status(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", getPermissionState("sms") == PermissionState.GRANTED);
        call.resolve(result);
    }

    /** senders 번호(숫자만)로 온 문자 중 since(밀리초) 이후 것을 읽는다. 권한이 없으면 먼저 허용을 묻는다. */
    @PluginMethod
    public void read(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            requestPermissionForAlias("sms", call, "afterPermission");
            return;
        }
        readInbox(call);
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        if (getPermissionState("sms") == PermissionState.GRANTED) {
            readInbox(call);
        } else {
            call.reject("문자 읽기 권한이 허용되지 않았다.");
        }
    }

    private void readInbox(PluginCall call) {
        Set<String> senders = new HashSet<>();
        JSArray requested = call.getArray("senders");
        if (requested != null) {
            try {
                for (int i = 0; i < requested.length(); i++) {
                    senders.add(digits(requested.getString(i)));
                }
            } catch (JSONException e) {
                call.reject("발신번호 목록을 읽지 못했다.");
                return;
            }
        }
        long since = call.getData().optLong("since", 0L);

        JSArray messages = new JSArray();
        if (!senders.isEmpty()) {
            try (Cursor cursor = getContext().getContentResolver().query(
                INBOX,
                new String[] { "address", "date", "body" },
                "date >= ?",
                new String[] { String.valueOf(since) },
                "date DESC"
            )) {
                while (cursor != null && cursor.moveToNext()) {
                    String sender = digits(cursor.getString(0));
                    if (!senders.contains(sender)) continue;
                    JSObject message = new JSObject();
                    message.put("sender", sender);
                    message.put("date", cursor.getLong(1));
                    message.put("body", cursor.getString(2));
                    messages.put(message);
                }
            } catch (SecurityException e) {
                call.reject("문자함을 읽을 수 없다.");
                return;
            }
        }
        JSObject result = new JSObject();
        result.put("messages", messages);
        call.resolve(result);
    }

    /** 번호에서 숫자만 남긴다. 국가번호(+82)로 온 번호는 0으로 시작하는 국내 형식으로 바꿔 비교한다. */
    static String digits(String raw) {
        if (raw == null) return "";
        String only = raw.replaceAll("[^0-9]", "");
        if (only.startsWith("82") && only.length() > 10) return "0" + only.substring(2);
        return only;
    }
}
