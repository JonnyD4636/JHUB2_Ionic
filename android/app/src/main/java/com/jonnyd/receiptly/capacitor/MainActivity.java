package com.jonnyd.receiptly.capacitor;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(ClaimExportPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
