<script setup>
import Updater from './components/Updater.vue'
</script>

<template>
	<Suspense>
		<template #default>
			<Updater/>
		</template>
		<template #fallback>
			<h1>Loading...</h1>
		</template>
	</Suspense>
</template>

<style>
html, body {
	background-color: white;
	display: flex;
	align-items: center;
	justify-content: center;
	height: 100%;
	position: relative;
}

#app {
	font-family: Avenir, Helvetica, Arial, sans-serif;
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
	text-align: center;
}
</style>
