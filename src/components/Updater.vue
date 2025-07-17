<script>
import {DFU, DFUse} from 'webdfu';
import {ref, reactive} from 'vue';

const restoreUserConfig = false; // Whether to restore user config after firmware update

const compatibleDevices = [
	{vendorId: 0x0483, productId: 0xDF11}, // nucleo-g0b1re
	{vendorId: 0x0483, productId: 0xA417}, // SB01
	{vendorId: 0x16D0, productId: 0x1456}, // CICADA
];

let webusbSupported = ref(true);
let device;
let errorMessage = ref('');

let manifestationTolerant = true;
let transferSize = 1024;

let firmwareStartAddress;
let userConfigAddress = 0x0803F800; // Last page
let userConfigSize = 256; // Size of user config in bytes

const states = reactive({
	WAITING_FOR_REQUEST: 'waitingForRequest',
	WAITING_FOR_DEVICE: 'waitingForDevice',
	READY: 'ready',
	ERASING: 'erasing',
	DOWNLOADING: 'downloading',
	FINISHED: 'finished',
	RESTARTED: 'restarted',
	UPGRADE_NOT_NEEDED: 'upgradeNotNeeded',
	ERROR: 'error'
});

const showConnectionHelp = ref(false);
const notInBootloaderMode = ref(false);

let state = ref(states.WAITING_FOR_REQUEST);
let deviceName = ref('');
let progress = ref(0);
let selectBeta = ref(false);
let latestBuildDate = ref(null);

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

		if (state.value !== states.FINISHED) {
			state.value = states.WAITING_FOR_REQUEST;
		}

		if (state.value === states.FINISHED) {
			state.value = states.RESTARTED;
		}

		console.info('USB device disconnected');
	}
}

async function searchForCompatibleDevices() {
	let devices = await navigator.usb.getDevices();
	devices = devices.filter(device => (
		compatibleDevices.find(d => (
			device.vendorId == d.vendorId && 
			device.productId == d.productId
		))
	));

	if (devices.length > 0 && devices[0].deviceClass !== 0x00) {
		notInBootloaderMode.value = true;

		return [];
	} else {
		notInBootloaderMode.value = false;
	}

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

function info(message) {
	console.info(message);

	if (message.startsWith('Copying')) {
		progress.value = 0;
		state.value = states.DOWNLOADING;
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
	device.logInfo = info;
	device.logWarning = console.warn;
	device.logError = setError;
	device.logProgress = setProgress;

	if (device.memoryInfo) {
		let segment = device.getFirstWritableSegment();
		console.log('First writable segment', segment.start.toString(16));

		if (segment) {
			device.startAddress = segment.start;
			firmwareStartAddress = segment.start;
		}
	}

	return device;
}

let retries = 0;

async function upgrade() {
	let interfaces = DFU.findDeviceDfuInterfaces(device);

	if (interfaces.length == 0) {
		setError('The selected device does not have any USB DFU interfaces.');
	} else if (interfaces.length == 1) {
		state.value = states.ERASING;

		await fixInterfaceNames(device, interfaces);
		device = await open(new DFU.Device(device, interfaces[0]));

		try {
			await download();
		} catch (error) {
			console.error('Error during download:', error);
			retries++;

			let devices = await searchForCompatibleDevices();

			if (devices.length > 0) {
				device = devices[0];
				deviceName.value = device.productName;
				state.value = states.READY;
			}

			await timeout(500);

			if (retries < 10) {
				return upgrade();
			} else {
				setError('Failed to upgrade device. Refresh and try again');
			}
		}
	} else {
		setError('Multiple DFU interfaces is not supported')
	}

	retries = 0;
}

async function findLatestFirmware() {
	const response = await fetch(`${deviceName.value.toLowerCase()}/latest.bin`);
	console.log(`Found firmware ${deviceName.value.toLowerCase()}/latest.bin`);
	return await response.arrayBuffer();
}

async function findLatestBetaFirmware() {
	const response = await fetch(`${deviceName.value.toLowerCase()}/latest-beta.bin`);
	console.log(`Found beta firmware ${deviceName.value.toLowerCase()}/latest-beta.bin`);
	return await response.arrayBuffer();
}

async function findLatestFirmwareDate() {
	const firmware = await findLatestFirmware();
	if (firmware.byteLength < 512) {
		throw new Error('Firmware is too small to contain build info');
	}
	const buildInfo = new Uint8Array(firmware.slice(0, 512));
	const buildInfoString = new TextDecoder().decode(buildInfo);
	const buildTimeMatch = buildInfoString.match(/<<<BUILD_TIME:(.*?)>>>/);
	if (buildTimeMatch) {
		const buildTime = `${buildTimeMatch[1]} UTC`;
		const buildDate = new Date(buildTime);
		console.info('Build time:', buildDate.toISOString());
		return buildDate;
	} else {
		throw new Error('Build time not found in build info');
	}
}

async function printDataAsHex(data) {
	let uint8Array;
	
	// Handle different input types
	if (data instanceof Blob) {
		const arrayBuffer = await data.arrayBuffer();
		uint8Array = new Uint8Array(arrayBuffer);
	} else if (data instanceof ArrayBuffer) {
		uint8Array = new Uint8Array(data);
	} else if (data instanceof Uint8Array) {
		uint8Array = data;
	} else {
		throw new Error('Input must be a Blob, ArrayBuffer, or Uint8Array');
	}
	
	let hexString = '';
	for (let i = 0; i < uint8Array.length; i += 16) {
		// Address column
		const address = i.toString(16).padStart(8, '0').toUpperCase();
		hexString += `${address}: `;
		// Hex bytes (16 per line)
		let hexBytes = '';
		let asciiChars = '';
		for (let j = 0; j < 16; j++) {
			if (i + j < uint8Array.length) {
				const byte = uint8Array[i + j];
				hexBytes += byte.toString(16).padStart(2, '0').toUpperCase() + ' ';
				// ASCII representation (printable chars only)
				asciiChars += (byte >= 32 && byte <= 126) ? String.fromCharCode(byte) : '.';
			} else {
				hexBytes += '   '; // 3 spaces for missing bytes
				asciiChars += ' ';
			}
		}
		hexString += hexBytes + ' |' + asciiChars + '|\n';
	}
	console.log(hexString);
	return hexString;
}

function storeArrayBuffer(key, arrayBuffer) {
    const uint8Array = new Uint8Array(arrayBuffer);
    const binaryString = Array.from(uint8Array)
        .map(byte => String.fromCharCode(byte))
        .join('');
    const base64String = btoa(binaryString);
    localStorage.setItem(key, base64String);
}

function getArrayBuffer(key) {
    const base64String = localStorage.getItem(key);
    if (!base64String) return null;
    
    const binaryString = atob(base64String);
    const uint8Array = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        uint8Array[i] = binaryString.charCodeAt(i);
    }
    return uint8Array.buffer;
}

async function readUserConfig() {
	try {
		let status = await device.getStatus();

		if (status.state.value == DFU.dfuERROR) {
			await device.clearStatus();
		}
	} catch (error) {
		setError('Failed to clear status');
	}

	try {
		device.startAddress = userConfigAddress;
		let userConfig = await device.do_upload(userConfigSize, userConfigSize);
		console.info('User config read successfully');
		await printDataAsHex(userConfig);
		// Save user config to local storage
		const userConfigArrayBuffer = await userConfig.arrayBuffer();

		// If first byte is 0xFF, don't store it
		if (
			userConfigArrayBuffer.byteLength === 0 ||
			new Uint8Array(userConfigArrayBuffer)[0] === 0xFF
		) {
			console.info('User config is empty, not storing in local storage');

			return false;
		}

		storeArrayBuffer('userConfig', userConfigArrayBuffer);

		return true;
	} catch (error) {
		console.error('Failed to read user config:', error);
	}
}

async function readBuildInfo() {
	try {
		let status = await device.getStatus();

		if (status.state.value == DFU.dfuERROR) {
			await device.clearStatus();
		}
	} catch (error) {
		setError('Failed to clear status');
	}

	try {
		device.startAddress = firmwareStartAddress;
		let buildInfo = await device.do_upload(256, 256);
		let buildInfoString = await buildInfo.text();
		const buildTimeMatch = buildInfoString.match(/<<<BUILD_TIME:(.*?)>>>/);

		if (buildTimeMatch) {
			const buildTime = `${buildTimeMatch[1]} UTC`;
			// Return build time as a Date object
			const buildDate = new Date(buildTime);
			console.info('Build time:', buildDate.toISOString());
			return buildDate;
		} else {
			throw new Error('Build time not found in build info');
		}
	} catch (error) {
		console.error('Failed to read build info:', error);
	}
}

async function writeUserConfig(config) {
	// Load user config from local storage if not provided
	if (!config) {
		const storedConfig = getArrayBuffer('userConfig');
		if (storedConfig) {
			config = new Uint8Array(storedConfig);
			console.info('Loaded user config from local storage');
		} else {
			config = new Uint8Array(userConfigSize).fill(0xFF); // Default to zeroed config if not found
			console.info('No user config found in local storage, using default');
		}
	} else {
		config = new Uint8Array(config); // Ensure config is a Uint8Array
		console.info('Using provided user config');
	}

	// If first byte is 0xFF (empty config), do nothing and exit
	if (config[0] === 0xFF) {
		console.info('User config is empty, skipping write');

		return;
	}

	try {
		let status = await device.getStatus();

		if (status.state.value == DFU.dfuERROR) {
			await device.clearStatus();
		}
	} catch (error) {
		setError('Failed to clear status');
	}

	try {
		device.startAddress = userConfigAddress;
		await device.do_download(userConfigSize, config, manifestationTolerant, true);
		console.info('User config written successfully');
	} catch (error) {
		console.error('Failed to write user config:', error);
	}
}

async function download() {
	let deviceBuildDate = new Date('1970-01-01T00:00:00Z'); // Default to epoch if no build date is found

	try {
		deviceBuildDate = await readBuildInfo();
	} catch (error) {
		console.error('Failed to read build info:', error);
	}

	if (!latestBuildDate.value || (latestBuildDate.value && deviceBuildDate < latestBuildDate.value)) {
		console.warn('Device build date is older than the latest firmware build date');
	} else {
		console.info('Device is already up to date');
		state.value = states.UPGRADE_NOT_NEEDED;
		return;
	}

	return;

	if (restoreUserConfig) {
		await readUserConfig();
	}

	device.startAddress = firmwareStartAddress;

	try {
		let status = await device.getStatus();

		if (status.state.value == DFU.dfuERROR) {
			await device.clearStatus();
		}
	} catch (error) {
		setError('Failed to clear status');
	}

	let file;

	if (selectBeta.value) {
		file = await findLatestBetaFirmware();
	} else {
		file = await findLatestFirmware();
	}

	await device.do_download(transferSize, file, manifestationTolerant);

	let configFound = false;

	if (restoreUserConfig) {
		configFound = await readUserConfig();
	}

	// Restore user config from local srorage if it was erased
	if (!configFound && restoreUserConfig) {
		await writeUserConfig(null);
	}

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

document.addEventListener('keydown', (event) => {
	// Register shortcut for CMD/CTRL + B to select beta firmware
	if ((event.metaKey || event.ctrlKey) && event.key === 'b') {
		event.preventDefault();
		selectBeta.value = !selectBeta.value;
	}
});

// Show warning when trying to unload page while programming
window.onbeforeunload = () => {
	if ([states.ERASING, states.DOWNLOADING].includes(state.value)) {
		return true;
	} else {
		return null;
	}
};

if (typeof navigator.usb === 'undefined') {
	webusbSupported.value = false;
} else {
	navigator.usb.addEventListener('connect', onConnect);
	navigator.usb.addEventListener('disconnect', onDisconnect);
}
</script>

<script setup>
import CircularLoader from './CircularLoader.vue';
import CollapseTransition from '@ivanv/vue-collapse-transition/src/CollapseTransition.vue'
import operaLogo from 'browser-logos/src/opera/opera.svg';
import chromeLogo from 'browser-logos/src/chrome/chrome.svg';
import edgeLogo from 'browser-logos/src/edge/edge.svg';

let devices = [];

if (webusbSupported.value) {
	devices = await searchForCompatibleDevices();
}

if (devices.length > 0) {
	device = devices[0];
	deviceName.value = device.productName;
	state.value = states.READY;

	try {
		const date = await findLatestFirmwareDate();
		latestBuildDate.value = date;
	} catch (error) {
		console.error('Failed to find latest firmware date:', error);
	}
} else {
	state.value = states.WAITING_FOR_REQUEST;
}

async function requestDevice() {
	showConnectionHelp.value = false;

	try {
		device = await navigator.usb.requestDevice({
			filters: compatibleDevices
		});

		if (device.deviceClass !== 0x00) {
			notInBootloaderMode.value = true;
			state.value = states.WAITING_FOR_REQUEST;
			device = null;

			return;
		} else {
			notInBootloaderMode.value = false;
		}
		
		deviceName.value = device.productName;
		state.value = states.READY;
	} catch (error) {
		console.error('No device selected');

		showConnectionHelp.value = true;
	}
}
</script>

<template>
	<div v-if="webusbSupported">
		<div v-if="state == states.WAITING_FOR_REQUEST">
			<button @click="requestDevice">Connect</button>
		</div>

		<div v-if="state == states.READY">
			<button type="button" @click="upgrade">
				Upgrade<br/>
				{{deviceName}}
				<span v-if="selectBeta" class="beta">
					<br/>(beta)
				</span>
			</button>
		</div>

		<div v-if="state == states.WAITING_FOR_DEVICE">
			<h1>Please connect a supported device</h1>
		</div>

		<div v-if="state == states.ERASING">
			<CircularLoader :diameter="200" :thickness="4" />
			<span>Erasing</span>
		</div>

		<div v-if="state == states.DOWNLOADING">
			<span>Upgrading</span>
		</div>

		<div v-if="state == states.FINISHED || state == states.RESTARTED">
			<span>Finished<br/><span v-if="state == states.FINISHED"><hr><small>Restarting<br/>device</small></span></span>
		</div>

		<div v-if="state == states.UPGRADE_NOT_NEEDED">
			<span>
				<span>Update not needed</span>
				<hr>
				<small>device is already<br>running the latest<br>firmware</small>
			</span>
		</div>

		<div class="error" v-if="state == states.ERROR">
			<span>{{errorMessage}}</span>
			<p>Don't worry. The device is fine. Try going through the update process one more time.</p>
			<p>It's recommended to connect directly to the computer and not via USB hub.</p>
			<p>If you're still having problems try another USB cable and USB port.</p>
		</div>

		<CircularLoader
			v-if="state == states.DOWNLOADING || state == states.FINISHED || state == states.RESTARTED"
			:diameter="200"
			:thickness="4"
			:progress="progress"
		/>

		<collapse-transition dimension="height" easing="ease-in-out" :duration="500">
			<div v-show="showConnectionHelp && state == states.WAITING_FOR_REQUEST">
				<transition name="fade" appear>
					<section class="connection-help" v-show="showConnectionHelp && state == states.WAITING_FOR_REQUEST">
						<div><img src="/iso_top.svg" alt=""></div>
						<div>
							<h2>Didn't see any devices in the connection menu?</h2>
							<p>Make sure the SB01 is in firmware update mode<br/>by holding the <span class="orange">shift</span> button while powering on.</p>
						</div>
					</section>
				</transition>
			</div>
		</collapse-transition>

		<collapse-transition dimension="height" easing="ease-in-out" :duration="500">
			<div v-show="notInBootloaderMode && state == states.WAITING_FOR_REQUEST">
				<transition name="fade" appear>
					<section class="connection-help" v-show="notInBootloaderMode && state == states.WAITING_FOR_REQUEST">
						<div><img src="/iso_top.svg" alt=""></div>
						<div>
							<h2>The SB01 is not in firmware update mode</h2>
							<p>Make sure the SB01 is in firmware update mode<br/>by holding the <span class="orange">shift</span> button while powering on.</p>
						</div>
					</section>
				</transition>
			</div>
		</collapse-transition>
	</div>

	<div v-if="!webusbSupported">
		<p>This browser is not supported.<br/>Try one of these:</p>
		<ul class="browser-list">
			<li><a href="https://www.opera.com/download" target="_blank"><img :src="operaLogo" alt="">Opera</a></li>
			<li><a href="https://www.google.com/chrome/" target="_blank"><img :src="chromeLogo" alt="">Chrome</a></li>
			<li><a href="https://www.microsoft.com/edge" target="_blank"><img :src="edgeLogo" alt="">Edge</a></li>
		</ul>
	</div>

	<footer>
		<span v-if="latestBuildDate">Latest build date: {{latestBuildDate.toUTCString()}}</span>
	</footer>
</template>

<style lang="postcss" scoped>
.collapse {
	&-leave-active {
		overflow: visible;
		transition: height 250ms 250ms, padding-top 250ms 250ms, padding-bottom 250ms 250ms !important;
	}
}

.fade {
	&-enter-active {
		transition: opacity 500ms 250ms ease-in-out, transform 750ms 250ms ease-out;
	}

	&-leave-active {
		transition: opacity 250ms ease-in-out;
	}

	&-enter-from,
	&-leave-to {
		opacity: 0;
	}

	&-enter-from {
		transform: translate(0, 50px);
	}
}

button {
	background-color: var(--black);
	color: white;
	border: none;
	width: 150px;
	height: 150px;
	border-radius: 75px;
	text-transform: uppercase;
	letter-spacing: 1px;
	line-height: 1.2rem;
	cursor: pointer;

	&:hover {
		opacity: 0.5;
	}
}

hr {
	width: 100px;
}

div > span {
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

.connection-help {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(calc(500px - 2rem), 1fr));
	column-gap: 4rem;
	row-gap: 2rem;
	align-items: center;
	justify-items: center;
	text-align: left;
	padding-top: 8rem;
	padding-bottom: 8rem;
	max-width: 1280px;
	margin: 0 auto;

	& > div {
		width: 100%;
	}

	img {
		width: 100%;
		height: auto;
	}
}

.error {
	display: inline-block;
	max-width: 600px;
	margin: 0 auto;
	padding: 10px 20px;
	border-radius: 10px;
	background-color: var(--orange);
	color: white;
}

.browser-list {
	list-style: none;
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	column-gap: 2rem;
	max-width: 400px;
	margin: 0 auto;
	padding: 0;

	img {
		margin-bottom: 1rem;
	}

	a {
		color: var(--black);
		text-decoration: none;
		text-transform: uppercase;

		&:hover {
			color: var(--gray);
		}
	}
}

.beta {
	color: var(--orange);
	font-size: 0.8rem;
}

footer {
	position: fixed;
	bottom: 0;
	right: 0;
	text-align: right;
	text-transform: uppercase;
	margin: 1rem;
	font-size: 1rem;
	color: var(--gray);
}
</style>
