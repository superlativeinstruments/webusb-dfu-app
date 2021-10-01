<script setup>
import {ref, computed} from 'vue';

const props = defineProps({
	diameter: Number,
	thickness: Number,
	progress: Number,
	time: Number
});

const progress = ref(props.progress || 0);

const strokeDasharray = computed(() => 2 * Math.PI * ((props.diameter  - props.thickness) / 2));
let strokeDashoffset = computed(() => 2 * Math.PI * ((props.diameter  - props.thickness) / 2) * (1 - progress.value));

if (typeof props.time !== 'undefined') {
	const steps = props.time / 250;
	let i = 0;
	let timer = setInterval(() => {
		i++;
		progress.value = i / steps;

		if (i >= steps) {
			clearTimeout(timer);
		}
	}, 250);
} else {
}
</script>

<template>
<svg
	class="circular-loader"
	:width="diameter"
	:height="diameter"
>
	<circle
		stroke="#EEE"
		:stroke-width="thickness"
		fill="transparent"
		:r="(diameter / 2) - (thickness / 2)"
		:cx="diameter / 2"
		:cy="diameter / 2"
	/>
	<circle
		:style="{strokeDashoffset, strokeDasharray}"
		class="progress-ring"
		stroke="black"
		:stroke-width="thickness"
		fill="transparent"
		:r="(diameter / 2) - (thickness / 2)"
		:cx="diameter / 2"
		:cy="diameter / 2"
		:transform="'rotate(-90 ' + (diameter / 2) + ' ' + (diameter / 2) + ')'"
	/>
</svg>
</template>

<style scoped>
.progress-ring {
	transition: 0.25s linear stroke-dashoffset;
}
</style>

