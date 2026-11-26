package it.mtgamici.apkupdater;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

// Aggiornamento dall'app: scarica l'APK della Release e apre l'installer di Android
// (niente browser, niente avviso "file non sicuro"). La prima volta Android chiede di
// permettere a questa app di installare app; poi basta toccare "Aggiorna".
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {

    @PluginMethod
    public void install(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) {
            call.reject("Indirizzo dell'APK non valido");
            return;
        }
        new Thread(() -> {
            try {
                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("Non riesco a creare la cartella");
                File apk = new File(dir, "update.apk");
                download(url, apk);
                Uri uri = ApkFileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".apkupdater", apk);
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                call.resolve();
            } catch (Exception e) {
                call.reject("Download non riuscito: " + e.getMessage(), e);
            }
        }).start();
    }

    private void download(String url, File out) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setInstanceFollowRedirects(true); // GitHub rimanda a objects.githubusercontent.com
        c.setConnectTimeout(20000);
        c.setReadTimeout(60000);
        int code = c.getResponseCode();
        if (code != 200) throw new Exception("HTTP " + code);
        long total = c.getContentLengthLong();
        long done = 0;
        int last = -1;
        try (InputStream in = c.getInputStream(); OutputStream os = new FileOutputStream(out)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) {
                os.write(buf, 0, n);
                done += n;
                if (total > 0) {
                    int pct = (int) (done * 100 / total);
                    if (pct != last) {
                        last = pct;
                        JSObject ev = new JSObject();
                        ev.put("percent", pct);
                        notifyListeners("progress", ev);
                    }
                }
            }
        } finally {
            c.disconnect();
        }
        if (total > 0 && done != total) throw new Exception("file incompleto");
    }
}
