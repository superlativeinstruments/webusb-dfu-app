WebUSB DFU App
==============

Web application for updating firmware through DFU.

## Adding supported device

- Update the `compatibleDevices` array in `/src/components/Updater.vue`.
- Add a directory under `/public` named the same as the USB product name string descriptor. Convert the name to lower case.
- Add `latest.bin` to this newly created directory.

## Adding new firmware for a device

- Find the device directory in `/public`.
- Backup the current `latest.bin`.
- Replace `latest.bin` with the new firmware. The file name must stay the same.

## Staging

Stage the app to [https://superlative-firmware.surge.sh/](https://superlative-firmware.surge.sh/) by running:
```bash
$ npm run stage
```

## Troubleshooting / Known issues

- The update process does not work if there is an active STLink connection to the device. Disconnect all active connections and try again if you are experience problems.
