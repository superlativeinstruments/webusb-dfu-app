💾 WebUSB DFU App
=================

Web application for updating firmware through DFU.

## ℹ️ Adding supported device

- Update the `compatibleDevices` array in `/src/components/Updater.vue`.
- Add a directory under `/public` named the same as the USB product name string descriptor. Convert the name to lower case.
- Add `latest.bin` to this newly created directory.

## ℹ️ Adding new firmware for a device

- Find the device directory in `/public`.
- Backup the current `latest.bin`.
- Replace `latest.bin` with the new firmware. The file name must stay the same.

## 💻 Run locally

This will run a local server and do automatic rebuild on file change.

```bash
$ pnpm run dev
```

## 🔧 Building

```bash
$ pnpm run build
```

## 📽️ Staging

Stage the app to [https://superlative-firmware.surge.sh/](https://superlative-firmware.surge.sh/) by running:
```bash
$ pnpm run stage
```

## 📡 Deployment

The project is automatically deployed to [firmware.playsuperlative.com](https://firmware.playsuperlative.com/) on push to main branch via Vercel.

## ❤️‍🩹 Troubleshooting / Known issues

- The update process does not work if there is an active STLink connection to the device. Disconnect all active connections and try again if you are experience problems.
