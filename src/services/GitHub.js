const proxyUrl = 'https://githubproxy.bishbashbosh.work';

export async function getLatestRelease(device) {
	const url = 'https://api.github.com/repos/superlativeinstruments/firmware-releases/releases/latest';
	const headers = {
		'User-Agent': 'SuperlativeFirmwareUpdater/1.0'
	};

	const release = await fetch(`${proxyUrl}?url=${encodeURIComponent(url)}`, {headers}).then(_ => _.json());
	const binary = release.assets.find(a => a.name.endsWith('.bin')).browser_download_url;
	const changelog = release.assets.find(a => a.name.endsWith('.md')).browser_download_url;
	const releaseDateTimeRaw = release.body.match(/Build Time: (.*)/)[1] + 'Z';
	const releaseDateTime = new Date(releaseDateTimeRaw);

	return {binary, changelog, releaseDateTime};
}

export async function getLatestPrerelease(device) {
	const url = 'https://api.github.com/repos/superlativeinstruments/firmware-releases/releases';
	const headers = {
		'User-Agent': 'SuperlativeFirmwareUpdater/1.0'
	};

	const releases = await fetch(`${proxyUrl}?url=${encodeURIComponent(url)}`, {headers}).then(_ => _.json());

	// Find the latest prerelease
	const release = releases.find(r => r.prerelease);
	const binary = release.assets.find(a => a.name.endsWith('.bin')).browser_download_url;
	const changelog = release.assets.find(a => a.name.endsWith('.md')).browser_download_url;
	const releaseDateTimeRaw = release.body.match(/Build Time: (.*)/)[1] + 'Z';
	const releaseDateTime = new Date(releaseDateTimeRaw);

	return {binary, changelog, releaseDateTime};
}

export async function downloadAsset(url) {
	const response = await fetch(`${proxyUrl}?url=${encodeURIComponent(url)}`);

	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}`);
	}

	return await response.arrayBuffer();
}
