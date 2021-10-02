<script setup>
import {ref, computed} from 'vue';

const props = defineProps({
	diameter: Number,
	thickness: Number,
	progress: Number,
	time: Number
});

const progress = ref(props.progress || 0);
const isEndless = ref(false);

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
}

// If no progress or time is defined, fall back to endless animation
if (typeof props.progress === 'undefined' && typeof props.time === 'undefined') {
	progress.value = 0.75;
	isEndless.value = true;

	let i = 0;
	let timer = setInterval(() => {
		progress.value = i == 0 ? 0.1 : 0.75;
		i = i == 0 ? 1 : 0;
	}, 2000);
}
</script>

<template>
<svg
	class="circular-loader"
	:width="diameter"
	:height="diameter"
>
	<g :class="{rotate: isEndless}">
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
			:class="{endless: isEndless}"
			stroke="black"
			:stroke-width="thickness"
			fill="transparent"
			:r="(diameter / 2) - (thickness / 2)"
			:cx="diameter / 2"
			:cy="diameter / 2"
			:transform="'rotate(-90 ' + (diameter / 2) + ' ' + (diameter / 2) + ')'"
		/>
	</g>
</svg>
</template>

<style scoped>
.progress-ring {
	transition: 0.25s linear stroke-dashoffset;
}

.progress-ring.endless {
	transition: 2s linear stroke-dashoffset;
}

.rotate {
	transform-origin: center center;
	animation: rotate 1s linear infinite;
}

@keyframes rotate {
	from {
		transform: rotate(0deg);
	}

	to {
		transform: rotate(360deg)
	}
}
</style>

