<script>
import {DFU, DFUse} from 'webdfu';
import {ref, reactive, computed} from 'vue';

const vendorId = 0x0483;
const compatibleDevices = [
	0xDF11, // nucleo-g0b1re
	0xDF12 // sb01
];

let webusbSupported = true;
let device;
let errorMessage = ref('');

let manifestationTolerant = true;
let transferSize = 1024;

const states = reactive({
	WAITING_FOR_REQUEST: 'waitingForRequest',
	WAITING_FOR_DEVICE: 'waitingForDevice',
	READY: 'ready',
	ERASING: 'erasing',
	DOWNLOADING: 'downloading',
	FINISHED: 'finished',
	ERROR: 'error'
});

let state = ref(states.WAITING_FOR_REQUEST);
let deviceName = ref('');
let progress = ref(0);

function setError(error) {
	state.value = states.ERROR;
	errorMessage.value = error;

	console.error(error);
}

function setProgress(bytesSent, bytesTotal) {
	progress.value = bytesSent / bytesTotal;
}

async function timeout(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function onConnect() {
	let devices = await searchForCompatibleDevices();

	if (devices.length > 0) {
		device = devices[0];
		deviceName.value = device.productName;
		progress.value = 0;
		state.value = states.READY;

		console.info('Supported USB device connected');
	}

}

function onDisconnect(event) {
	if (device === event.device) {
		device.disconnected = true;
		device = null;
		state.value = states.WAITING_FOR_REQUEST;

		console.info('USB device disconnected');
	}
}

async function searchForCompatibleDevices() {
	let devices = await navigator.usb.getDevices();
	devices = devices.filter(device => (device.vendorId == vendorId && compatibleDevices.includes(device.productId)));

	return devices;
}

async function fixInterfaceNames(device_, interfaces) {
	// Check if any interface names were not read correctly
	if (interfaces.some(intf => (intf.name == null))) {
		// Manually retrieve the interface name string descriptors
		let tempDevice = new DFU.Device(device_, interfaces[0]);
		await tempDevice.device_.open();
		await tempDevice.device_.selectConfiguration(1);
		let mapping = await tempDevice.readInterfaceNames();
		await tempDevice.close();

		for (let intf of interfaces) {
			if (intf.name === null) {
				let configIndex = intf.configuration.configurationValue;
				let intfNumber = intf['interface'].interfaceNumber;
				let alt = intf.alternate.alternateSetting;
				intf.name = mapping[configIndex][intfNumber][alt];
			}
		}
	}
}

async function getDFUDescriptorProperties(device) {
	// Attempt to read the DFU functional descriptor
	const data = await device.readConfigurationDescriptor(0);

	let configDesc = DFU.parseConfigurationDescriptor(data);
	let funcDesc = null;
	let configValue = device.settings.configuration.configurationValue;

	if (configDesc.bConfigurationValue == configValue) {
		for (let desc of configDesc.descriptors) {
			if (desc.bDescriptorType == 0x21 && desc.hasOwnProperty('bcdDFUVersion')) {
				funcDesc = desc;
				break;
			}
		}
	}

	if (funcDesc) {
		return {
			WillDetach:            ((funcDesc.bmAttributes & 0x08) != 0),
			ManifestationTolerant: ((funcDesc.bmAttributes & 0x04) != 0),
			CanUpload:             ((funcDesc.bmAttributes & 0x02) != 0),
			CanDnload:             ((funcDesc.bmAttributes & 0x01) != 0),
			TransferSize:          funcDesc.wTransferSize,
			DetachTimeOut:         funcDesc.wDetachTimeOut,
			DFUVersion:            funcDesc.bcdDFUVersion
		};
	}
}

async function open(device) {
	await device.open();
	// Attempt to parse the DFU functional descriptor
	let desc = await getDFUDescriptorProperties(device);

	if (desc) {
		device.properties = desc;
		transferSize = desc.TransferSize;

		if (desc.CanDnload) {
			manifestationTolerant = desc.ManifestationTolerant;
		}

		if (device.settings.alternate.interfaceProtocol == 0x02) {
			if (!desc.CanDnload) {
				setError('Device is not configured to be updatable');
			}
		}

		if (desc.DFUVersion == 0x011a && device.settings.alternate.interfaceProtocol == 0x02) {
			device = new DFUse.Device(device.device_, device.settings);
		}
	}

	// Bind logging methods
	device.logDebug = console.log;
	device.logInfo = console.info;
	device.logWarning = console.warn;
	device.logError = setError;
	device.logProgress = setProgress;

	if (device.memoryInfo) {
		let segment = device.getFirstWritableSegment();
		console.log('First writable segment', segment.start.toString(16));

		if (segment) {
			device.startAddress = segment.start;
		}
	}

	return device;
}

async function upgrade() {
	let interfaces = DFU.findDeviceDfuInterfaces(device);

	if (interfaces.length == 0) {
		setError('The selected device does not have any USB DFU interfaces.');
	} else if (interfaces.length == 1) {
		state.value = states.DOWNLOADING;

		await fixInterfaceNames(device, interfaces);
		device = await open(new DFU.Device(device, interfaces[0]));
		await download();
	} else {
		setError('Multiple DFU interfaces is not supported')
	}
}

async function findLatestFirmware() {
	const response = await fetch(`${deviceName.value.toLowerCase()}/latest.bin`);
	return await response.arrayBuffer();
}

async function download() {
	try {
		let status = await device.getStatus();

		if (status.state.value == DFU.dfuERROR) {
			await device.clearStatus();
		}
	} catch (error) {
		setError('Failed to clear status');
	}

	const file = await findLatestFirmware();

	await device.do_download(transferSize, file, manifestationTolerant);

	console.info('Download done');

	if (!manifestationTolerant) {
		console.info('Resetting device');

		// Send 0 data to trigger device reset.
		// This might throw an inconsequential transfer error that can be ignored.
		try {
			await device.device_.controlTransferOut({
				requestType: 'class',
				recipient: 'interface',
				request: DFU.DNLOAD,
				value: 0,
				index: device.intfNumber
			});
		} catch (error) {
			// Pass
		}

		state.value = states.FINISHED;

		await timeout(5000);

		onDisconnect({device: device});
	}
}

// Show warning when trying to unload page while programming
window.onbeforeunload = () => {
	if ([states.ERASING, states.DOWNLOADING].includes(state.value)) {
		return true;
	} else {
		return null;
	}
};

if (typeof navigator.usb === 'undefined') {
	webusbSupported = false;
} else {
	navigator.usb.addEventListener('connect', onConnect);
	navigator.usb.addEventListener('disconnect', onDisconnect);
}
</script>

<script setup>
import CircularLoader from './CircularLoader.vue';

let devices = [];
devices = await searchForCompatibleDevices();

if (devices.length > 0) {
	device = devices[0];
	deviceName.value = device.productName;
	state.value = states.READY;
} else {
	state.value = states.WAITING_FOR_REQUEST;
}

async function requestDevice() {
	try {
		device = await navigator.usb.requestDevice({
			filters: compatibleDevices.map(element => {
				return {vendorId,  productId: element};
			})
		});
		
		deviceName.value = device.productName;
		state.value = states.READY;
	} catch (error) {
		console.error('No device selected');

		state.value = states.WAITING_FOR_REQUEST;
	}
}

// setError('Some error occured!');
// state.value = states.ERASING;
</script>

<template>
	<div v-if="webusbSupported">
		<div v-if="state == states.WAITING_FOR_REQUEST">
			<button @click="requestDevice">Connect</button>
		</div>

		<div v-if="state == states.READY">
			<button type="button" @click="upgrade">Upgrade<br/>{{deviceName}}</button>
		</div>

		<div v-if="state == states.WAITING_FOR_DEVICE">
			<h1>Please connect a supported device</h1>
		</div>

		<div v-if="state == states.ERASING">
			<CircularLoader :diameter="200" :thickness="4" :time="3000" />
			<span>Erasing</span>
		</div>

		<div v-if="state == states.DOWNLOADING">
			<span>Upgrading</span>
		</div>

		<div v-if="state == states.FINISHED">
			<span>Finished<br/><hr><small>Restarting<br/>device</small></span>
		</div>

		<div class="error" v-if="state == states.ERROR">
			<span>{{errorMessage}}</span>
		</div>

		<CircularLoader
			v-if="state == states.READY || state == states.DOWNLOADING || state == states.FINISHED"
			:diameter="200"
			:thickness="4"
			:progress="progress"
		/>
	</div>

	<div v-if="!webusbSupported">
		<p>This browser does not support WebUSB</p>
	</div>

	<CircularLoader :diameter="200" :thickness="4" />
</template>

<style scoped>
button {
	background-color: black;
	color: white;
	border: none;
	width: 150px;
	height: 150px;
	border-radius: 75px;
	text-transform: uppercase;
	letter-spacing: 1px;
	line-height: 1.2rem;
	cursor: pointer;
}

span {
	text-transform: uppercase;
	letter-spacing: 1px
}

.circular-loader {
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	z-index: 0;
}

div > div {
	position: relative;
	z-index: 1;
}

.error {
	padding: 10px 20px;
	border-radius: 10px;
	background-color: red;
	color: white;
}
</style>
