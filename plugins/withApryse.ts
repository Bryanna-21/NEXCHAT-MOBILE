import {
  ConfigPlugin,
  withAndroidManifest,
  withAppBuildGradle,
  withMainApplication,
} from "@expo/config-plugins";

const withApryse: ConfigPlugin = (config) => {
  config = withMainApplication(config, (mod) => {
    const contents = mod.modResults.contents;

    if (contents.includes("RNPdftronPackage")) {
      return mod;
    }

    const importMarker = "import com.facebook.react.PackageList";

    if (contents.includes(importMarker)) {
      mod.modResults.contents = contents.replace(
        importMarker,
        `${importMarker}\nimport com.pdftron.reactnative.RNPdftronPackage`,
      );
    }

    const packagesMarker =
      "PackageList(this).packages.apply {";

    if (mod.modResults.contents.includes(packagesMarker)) {
      mod.modResults.contents =
        mod.modResults.contents.replace(
          packagesMarker,
          `${packagesMarker}\n              add(RNPdftronPackage())`,
        );
    }

    return mod;
  });

  config = withAppBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;

    if (!contents.includes("manifestPlaceholders")) {
      contents = contents.replace(
        /defaultConfig\s*\{/,
        `defaultConfig {
        manifestPlaceholders = [
            pdftronLicenseKey: project.findProperty("PDFTRON_LICENSE_KEY") ?: ""
        ]`,
      );
    } else if (!contents.includes("pdftronLicenseKey")) {
      contents = contents.replace(
        /defaultConfig\s*\{/,
        `defaultConfig {
        manifestPlaceholders.pdftronLicenseKey =
            project.findProperty("PDFTRON_LICENSE_KEY") ?: ""`,
      );
    }

    mod.modResults.contents = contents;
    return mod;
  });

  config = withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;

    if (!manifest.$) {
      manifest.$ = {
        "xmlns:android": "http://schemas.android.com/apk/res/android",
      };
    }

    const application = manifest.application?.[0];

    if (!application) {
      throw new Error(
        "NexChat Apryse plugin could not find the Android application node.",
      );
    }

    application.$ = {
      ...(application.$ ?? {}),
      "android:largeHeap": "true",
    };

    application["meta-data"] = application["meta-data"] ?? [];

    const existing = application["meta-data"].find(
      (item) => item.$?.["android:name"] === "pdftron_license_key",
    );

    if (existing) {
      existing.$["android:value"] = "${pdftronLicenseKey}";
    } else {
      application["meta-data"].push({
        $: {
          "android:name": "pdftron_license_key",
          "android:value": "${pdftronLicenseKey}",
        },
      });
    }

    const activity = application.activity?.find(
      (item) => item.$?.["android:name"] === ".MainActivity",
    );

    if (activity) {
      activity.$ = {
        ...(activity.$ ?? {}),
        "android:windowSoftInputMode": "adjustPan",
      };
    }

    return mod;
  });

  return config;
};

export default withApryse;
