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
