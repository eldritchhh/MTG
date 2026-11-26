package it.mtgamici.apkupdater;

import androidx.core.content.FileProvider;

// Classe propria: Capacitor dichiara già androidx FileProvider, due provider con lo stesso nome non si possono avere
public class ApkFileProvider extends FileProvider {}
