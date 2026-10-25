package com.jonnyd.receiptly.capacitor;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;

@CapacitorPlugin(name = "ClaimExport")
public class ClaimExportPlugin extends Plugin {
    @PluginMethod
    public void savePdf(PluginCall call) {
        String fileName = call.getString("fileName");
        String data = call.getString("data");
        if (fileName == null || data == null || !fileName.endsWith(".pdf")) {
            call.reject("Invalid PDF export");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/pdf");
        intent.putExtra(Intent.EXTRA_TITLE, fileName);
        startActivityForResult(call, intent, "savePdfResult");
    }

    @ActivityCallback
    private void savePdfResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject response = new JSObject();
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            response.put("saved", false);
            call.resolve(response);
            return;
        }
        Uri destination = result.getData().getData();
        try (OutputStream output = getContext().getContentResolver().openOutputStream(destination)) {
            if (output == null) throw new IllegalStateException("Could not open PDF destination");
            output.write(Base64.decode(call.getString("data"), Base64.DEFAULT));
            response.put("saved", true);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Could not save the PDF", error);
        }
    }
}
