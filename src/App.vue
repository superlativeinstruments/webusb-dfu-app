<script setup>
import Updater from './components/Updater.vue';
</script>

<template>
	<header>
		<div>Firmware Updater</div>
		<div>
			<a href="https://playsuperlative.com/" target="_self">
				<img class="logo" src="/logo.svg" alt="Superlative™">
			</a>
		</div>
	</header>

	<main>
	<Suspense>
		<template #default>
			<Updater/>
		</template>
		<template #fallback>
			<h2>Loading...</h2>
		</template>
	</Suspense>
	</main>
</template>

<style lang="postcss">
@import-normalize;
@import-sanitize;

:root {
	--black: #141414;
	--dark_gray: #232323;
	--gray: #8C8C8C;
	--light_gray: #F6F4F2;
	--white: #FFFFFF;
	--orange:#E66F27;
	font-size: 15px;

	/* By default ligatures (sb01) are off; turn on for specific elements. */
	font-variant-ligatures: none;
	color: var(--black);
}

.black {
	color: var(--black);
}

.dark-gray {
	color: var(--dark_gray);
}

.gray {
	color: var(--gray);
}

.light-gray {
	color: var(--light_gray);
}

.white {
	color: var(--white);
}

.orange {
	color: var(--orange);
}

@font-face{
	font-family: 'SL-Light';
	src: url('/fonts/Superlative-Light.woff2') format('woff2');
	font-weight: normal;
	font-style: normal;
	font-display: block;
}

@font-face{
	font-family: 'SL-Regular';
	src: url('/fonts/Superlative-Regular.woff2') format('woff2');
	font-weight: normal;
	font-style: normal;
	font-display: block;
}

@font-face{
	font-family: 'SL-Regular-Condensed';
	src: url('/fonts/Superlative-RegularCondensed.woff2') format('woff2');
	font-weight: normal;
	font-style: normal;
	font-display: block;
}

html, body {
	background-color: white;
	display: grid;
	grid-template-rows: 60px auto;
	width: 100%;
	min-height: 100vh;
	position: relative;
	padding: 0;
	margin: 0;
	font-family: 'SL-Regular-Condensed', Helvetica, Arial, sans-serif;
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
}

main {
	display: grid;
	margin: auto;
	width: 100%;
	height: auto;
	padding: 0;
	text-align: center;
}

header {
	display: grid;
	grid-template-columns: 1fr 1fr;
	column-gap: 4rem;
	align-items: center;
	max-height: 60px;
	padding: 1rem;
	text-align: center;
	text-transform: uppercase;
	color: var(--gray);

	& > div:first-child {
		text-align: left;
	}

	& > div:last-child {
		text-align: right;
	}

	.logo {
		width: 2rem;
		height: 2rem;

		&:hover {
			opacity: 0.5;
		}
	}
}

h1, h2, h3, h4, h5, h6 {
	font-family: 'SL-Light', Helvetica, Arial, sans-serif;
	line-height: 1;
	text-transform: uppercase;
}

h1 {
	font-size: 3rem;
}

h2 {
	font-size: 2.4rem;
}

p {
	font-family: 'SL-Light', Helvetica, Arial, sans-serif;
	font-size: 25px;
	line-height: 1.2;
}

code {
	font-family: 'SL-Regular-Condensed', Helvetica, Arial, sans-serif;
	font-variant-ligatures: common-ligatures;
}

.changelog {
	font-family: 'SL-Regular', Helvetica, Arial, sans-serif;
}

.changelog h1 {
	text-align: center;
	font-size: 1.5rem;
	letter-spacing: 0.1rem;
	margin-bottom: 1rem;
}

.changelog h2 {
	font-size: 1.1rem;
	letter-spacing: 0.1rem;
	margin-top: 4rem;
	padding-bottom: 1rem;
	border-bottom: 1px solid var(--light_gray);
}

.changelog h3 {
	font-size: 1rem;
	letter-spacing: 0.1rem;
	margin-top: 2rem;
	margin-bottom: 1rem;
}
</style>
