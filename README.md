# Receiptly Ionic

Receiptly is an Ionic and Angular app for organising expense claims. It supports receipt photos and digital copies, manual receipt references, claim archiving, and PDF export. The `android/` directory contains the Capacitor Android project for this version of the app.

## Run locally

Install Node.js, then run:

```sh
npm ci
npm start
```

## Build the web app

```sh
npm run build
```

The generated site is placed in `www/`.

## Update the Capacitor Android app

```sh
npm run android:sync
npm run android:open
```

The first command rebuilds the web app and copies it into the Android project. The second opens that project in Android Studio.

## Checks

```sh
npm test
npm run lint
```

The separate native Kotlin implementation is not included in this repository.
