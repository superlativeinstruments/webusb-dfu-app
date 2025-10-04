export async function getLatestRelease(device) {
	const url = 'https://api.github.com/repos/superlativeinstruments/firmware-releases/releases/latest';
	const release = await fetch(url).then(_ => _.json());

	return release;
}

export async function getLatestPrerelease(device) {
	const url = 'https://api.github.com/repos/superlativeinstruments/firmware-releases/releases';
	const releases = await fetch(url).then(_ => _.json());

	// Find the latest prerelease
	const release = releases.find(r => r.prerelease);
	const file = release.assets[0].browser_download_url;
	const releaseDateTimeRaw = release.body.match(/Build Time: (.*)/)[1];
	const releaseDateTime = new Date(releaseDateTimeRaw).toISOString();
	console.log(releaseDateTimeRaw);

	return {file, releaseDateTime};
}
