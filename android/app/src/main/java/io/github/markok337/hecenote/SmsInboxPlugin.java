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

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 폰의 받은 문자함(일반·장문 문자)에서 등록한 발신번호의 문자만 읽어 앱에 넘긴다.
 * 다른 번호의 문자는 조회 결과에서 곧바로 버리고 앱에 넘기지 않는다. 문자를 보내거나 지우지는 않는다.
 */
@CapacitorPlugin(
    name = "SmsInbox",
    permissions = { @Permission(alias = "sms", strings = { Manifest.permission.READ_SMS }) }
)
public class SmsInboxPlugin extends Plugin {

    private static final Uri INBOX = Uri.parse("content://sms/inbox");
    private static final Uri MMS = Uri.parse("content://mms");
    private static final Uri MMS_PART = Uri.parse("content://mms/part");
    // 삼성 메시지의 채팅(RCS) 저장소. 카드사 같은 기관의 "대화" 메시지가 여기에 들어 있다.
    private static final Uri CHAT = Uri.parse("content://im/chat");

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

    /** 받은 문자 한 통. 일반 문자(SMS)는 본문을 바로 갖고, 장문·사진 문자(MMS)는 mmsId 로 본문을 따로 읽는다. */
    private static final class Item {
        final String sender;
        final long date;
        final String body;
        final long mmsId;

        Item(String sender, long date, String body, long mmsId) {
            this.sender = sender;
            this.date = date;
            this.body = body;
            this.mmsId = mmsId;
        }
    }

    /**
     * since(밀리초) 이후 받은 문자를 일반 문자와 장문·사진 문자(MMS) 모두에서 모은다.
     * 카드 승인 문자는 길면 LMS(MMS 저장소)로 오기 때문에 두 곳을 다 읽어야 한다.
     */
    private List<Item> loadInbox(long since) {
        List<Item> items = new ArrayList<>();
        try (Cursor cursor = getContext().getContentResolver().query(
            INBOX,
            new String[] { "address", "date", "body" },
            "date >= ?",
            new String[] { String.valueOf(since) },
            "date DESC"
        )) {
            while (cursor != null && cursor.moveToNext()) {
                items.add(new Item(cursor.getString(0), cursor.getLong(1), cursor.getString(2), -1L));
            }
        }
        // MMS 의 date 는 초 단위, msg_box 1 이 받은 편지함이다.
        try (Cursor cursor = getContext().getContentResolver().query(
            MMS,
            new String[] { "_id", "date" },
            "msg_box = 1 AND date >= ?",
            new String[] { String.valueOf(since / 1000L) },
            "date DESC"
        )) {
            while (cursor != null && cursor.moveToNext()) {
                long id = cursor.getLong(0);
                items.add(new Item(mmsSender(id), cursor.getLong(1) * 1000L, null, id));
            }
        } catch (RuntimeException e) {
            // 기기에 따라 MMS 저장소를 못 읽을 수 있다. 그래도 일반 문자는 돌려준다.
        }
        items.addAll(loadChat(since));
        return items;
    }

    /**
     * 삼성 메시지의 채팅(RCS) 저장소에서 받은 메시지를 읽는다. 날짜는 밀리초로 보지만 초 단위로 적혀 있으면 밀리초로 바꾼다.
     * 이 저장소가 없거나 읽지 못하는 기기에서는 빈 목록을 돌려준다.
     */
    private List<Item> loadChat(long since) {
        List<Item> items = new ArrayList<>();
        try (Cursor cursor = getContext().getContentResolver().query(
            CHAT,
            new String[] { "address", "date", "body", "type" },
            null,
            null,
            "date DESC"
        )) {
            while (cursor != null && cursor.moveToNext()) {
                long date = cursor.getLong(1);
                if (date < 100_000_000_000L) date *= 1000L;
                if (date < since) break;
                // type 2 는 내가 보낸 메시지다.
                if (cursor.getInt(3) == 2) continue;
                String body = cursor.getString(2);
                if (body == null || body.isEmpty()) continue;
                items.add(new Item(cursor.getString(0), date, body, -1L));
            }
        } catch (RuntimeException e) {
            // 삼성 메시지가 아니거나 저장소를 못 읽는 기기다. 다른 저장소의 문자는 그대로 돌려준다.
        }
        return items;
    }

    /** MMS 의 보낸 쪽(type 137 = FROM). */
    private String mmsSender(long id) {
        try (Cursor cursor = getContext().getContentResolver().query(
            Uri.parse("content://mms/" + id + "/addr"),
            new String[] { "address" },
            "type = 137",
            null,
            null
        )) {
            if (cursor != null && cursor.moveToFirst()) return cursor.getString(0);
        } catch (RuntimeException e) {
            // 보낸 쪽을 못 읽으면 번호 없음으로 둔다.
        }
        return null;
    }

    /** MMS 의 글 부분(text/plain)을 이어 붙인다. */
    private String mmsText(long id) {
        StringBuilder text = new StringBuilder();
        try (Cursor cursor = getContext().getContentResolver().query(
            MMS_PART,
            new String[] { "text" },
            "mid = ? AND ct = 'text/plain'",
            new String[] { String.valueOf(id) },
            null
        )) {
            while (cursor != null && cursor.moveToNext()) {
                String part = cursor.getString(0);
                if (part == null) continue;
                if (text.length() > 0) text.append('\n');
                text.append(part);
            }
        } catch (RuntimeException e) {
            // 글을 못 읽으면 빈 본문이 되어 아래에서 건너뛴다.
        }
        return text.toString();
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
            try {
                for (Item item : loadInbox(since)) {
                    String sender = digits(item.sender);
                    if (!senders.contains(sender)) continue;
                    String body = item.mmsId >= 0 ? mmsText(item.mmsId) : item.body;
                    if (body == null || body.isEmpty()) continue;
                    JSObject message = new JSObject();
                    message.put("sender", sender);
                    message.put("date", item.date);
                    message.put("body", body);
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

    /**
     * 점검용. since(밀리초) 이후 문자함의 전체 건수와 보낸 번호별 건수만 알려 준다. 본문은 읽지 않는다.
     * 등록한 번호의 문자가 안 보일 때 문자함에 무엇이 있는지 확인하려는 것이다. mms 는 그중 장문·사진 문자 건수다.
     */
    @PluginMethod
    public void summary(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            call.reject("문자 읽기 권한이 허용되지 않았다.");
            return;
        }
        long since = call.getData().optLong("since", 0L);
        Map<String, Integer> counts = new LinkedHashMap<>();
        int mms = 0;
        List<Item> items;
        try {
            items = loadInbox(since);
        } catch (SecurityException e) {
            call.reject("문자함을 읽을 수 없다.");
            return;
        }
        for (Item item : items) {
            if (item.mmsId >= 0) mms++;
            // 점검용이라 숫자만 남기지 않고 보낸 쪽의 원래 표기를 그대로 센다.
            String sender = item.sender == null ? "" : item.sender;
            counts.put(sender, counts.getOrDefault(sender, 0) + 1);
        }
        JSArray senders = new JSArray();
        for (Map.Entry<String, Integer> entry : counts.entrySet()) {
            JSObject entryItem = new JSObject();
            entryItem.put("sender", entry.getKey());
            entryItem.put("count", entry.getValue());
            senders.put(entryItem);
        }
        JSObject result = new JSObject();
        JSArray sources = new JSArray();
        Set<String> wanted = new HashSet<>();
        JSArray requested = call.getArray("senders");
        if (requested != null) {
            for (int i = 0; i < requested.length(); i++) {
                try {
                    wanted.add(digits(requested.getString(i)));
                } catch (JSONException e) {
                    // 읽지 못한 번호는 건너뛴다.
                }
            }
        }
        for (String line : probeSources(since, wanted)) sources.put(line);
        result.put("sources", sources);
        result.put("total", items.size());
        result.put("mms", mms);
        result.put("senders", senders);
        call.resolve(result);
    }

    /**
     * 점검용. 저장소 두 곳(일반 문자 전체, 장문·사진 문자 전체)을 상자 구분 없이 훑어, 곳마다 전체 건수와
     * 등록한 번호(wanted)와 일치하는 건수, 보낸 쪽별 건수 몇 개를 한 줄 문구로 만든다(본문은 읽지 않는다).
     * 카드 문자가 어느 저장소·상자에 들어 있는지 찾으려는 것이다. 재난문자(#CMAS#)는 뺀다.
     */
    private List<String> probeSources(long since, Set<String> wanted) {
        List<String> lines = new ArrayList<>();
        lines.add(probe("sms", Uri.parse("content://sms"), "address", "type", String.valueOf(since), false, wanted));
        lines.add(probe("mms", MMS, null, "msg_box", String.valueOf(since / 1000L), true, wanted));
        // 삼성 메시지의 채팅(RCS) 저장소 후보. 있는지, 읽히는지, 어떤 열이 있는지만 본다.
        for (String path : new String[] { "content://im/chat", "content://im/message", "content://im/sessions" }) {
            lines.add(probeColumns(path, wanted));
        }
        return lines;
    }

    /** 저장소가 있는지, 읽히는지, 열 이름과 건수를 한 줄로 알려 준다(본문은 읽지 않는다). */
    private String probeColumns(String path, Set<String> wanted) {
        try (Cursor cursor = getContext().getContentResolver().query(Uri.parse(path), null, null, null, null)) {
            if (cursor == null) return path + " 없음";
            int addressIndex = cursor.getColumnIndex("address");
            int matched = 0;
            while (addressIndex >= 0 && cursor.moveToNext()) {
                if (wanted.contains(digits(cursor.getString(addressIndex)))) matched++;
            }
            StringBuilder text = new StringBuilder(path + " " + cursor.getCount() + "건 중 등록번호 " + matched + "건 열: ");
            String[] names = cursor.getColumnNames();
            for (int i = 0; i < names.length && i < 40; i++) {
                if (i > 0) text.append(',');
                text.append(names[i]);
            }
            return text.toString();
        } catch (RuntimeException e) {
            return path + " 오류(" + e.getClass().getSimpleName() + ")";
        }
    }

    /** 한 저장소를 훑는다. mms 이면 보낸 쪽을 addr 표에서 읽는다. kindColumn 은 상자·종류를 나눠 세려는 열이다. */
    private String probe(String name, Uri uri, String addressColumn, String kindColumn, String since, boolean mms, Set<String> wanted) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        Map<String, Integer> matched = new LinkedHashMap<>();
        int total = 0;
        try (Cursor cursor = getContext().getContentResolver().query(uri, null, "date >= ?", new String[] { since }, "date DESC")) {
            if (cursor == null) return name + " 읽지 못함";
            int addressIndex = addressColumn == null ? -1 : cursor.getColumnIndex(addressColumn);
            int kindIndex = cursor.getColumnIndex(kindColumn);
            int idIndex = cursor.getColumnIndex("_id");
            while (cursor.moveToNext()) {
                total++;
                String sender = null;
                if (mms && idIndex >= 0 && total <= 300) sender = mmsSender(cursor.getLong(idIndex));
                else if (addressIndex >= 0) sender = cursor.getString(addressIndex);
                if (sender != null && sender.startsWith("#CMAS#")) continue;
                String kind = kindIndex >= 0 ? cursor.getString(kindIndex) : "?";
                String label = (sender == null ? "없음" : sender) + "/상자" + kind;
                counts.put(label, counts.getOrDefault(label, 0) + 1);
                if (sender != null && wanted.contains(digits(sender))) {
                    matched.put("상자" + kind, matched.getOrDefault("상자" + kind, 0) + 1);
                }
            }
        } catch (RuntimeException e) {
            return name + " 오류(" + e.getClass().getSimpleName() + ")";
        }
        int matchedTotal = 0;
        StringBuilder byBox = new StringBuilder();
        for (Map.Entry<String, Integer> entry : matched.entrySet()) {
            matchedTotal += entry.getValue();
            if (byBox.length() > 0) byBox.append(' ');
            byBox.append(entry.getKey()).append(':').append(entry.getValue());
        }
        StringBuilder text = new StringBuilder(name + " " + total + "건 중 등록번호 " + matchedTotal + "건");
        if (byBox.length() > 0) text.append('(').append(byBox).append(')');
        // 보낸 쪽 목록은 많은 순 앞쪽 몇 개만 보여 준다.
        List<Map.Entry<String, Integer>> sorted = new ArrayList<>(counts.entrySet());
        sorted.sort((a, b) -> b.getValue() - a.getValue());
        for (int i = 0; i < sorted.size() && i < 6; i++) {
            text.append(i == 0 ? " [" : ", ").append(sorted.get(i).getKey()).append(' ').append(sorted.get(i).getValue());
        }
        if (!sorted.isEmpty()) text.append(']');
        return text.toString();
    }

    /** 번호에서 숫자만 남긴다. 국가번호(+82)로 온 번호는 0으로 시작하는 국내 형식으로 바꿔 비교한다. */
    static String digits(String raw) {
        if (raw == null) return "";
        String only = raw.replaceAll("[^0-9]", "");
        if (raw.contains("+82") && only.startsWith("82")) {
            // +82 로 온 번호는 국내 형식으로 되돌린다. 8자리 대표번호(1588…)는 0을 붙이지 않는다.
            String national = only.substring(2);
            return national.length() == 8 && national.startsWith("1") ? national : "0" + national;
        }
        if (only.startsWith("82") && only.length() > 10) return "0" + only.substring(2);
        return only;
    }
}
