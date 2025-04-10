import { type Keyframe } from "../schemas/keyframe";

import { CurveInterpolator } from "./curve-interpolator";

export class KeyframeBuilder {
	private readonly property: Keyframe[];
	private readonly length: number;

	private readonly cubicBuilder: CurveInterpolator;

	constructor(value: Keyframe[] | number, length: number, initialValue = 0) {
		this.property = this.createKeyframes(value, length, initialValue);
		this.length = length;

		this.cubicBuilder = new CurveInterpolator();
	}

	public getValue(time: number): number {
		const keyframe = this.property.find(value => time >= value.start && time < value.start + value.length);
		if (!keyframe) {
			if (this.property.length > 0) {
				if (time >= this.length) return this.property[this.property.length - 1].to;
				if (time < 0) return this.property[0].from;
			}
			return 1;
		}

		const progress = (time - keyframe.start) / keyframe.length;
		switch (keyframe.interpolation) {
			case "bezier":
				return this.cubicBuilder.getValue(keyframe.from, keyframe.to, progress, keyframe.easing);
			case "constant":
				return keyframe.from;
			case "linear":
			default:
				return keyframe.from + (keyframe.to - keyframe.from) * progress;
		}
	}

	private createKeyframes(value: Keyframe[] | number, length: number, initialValue = 0): Keyframe[] {
		if (typeof value === "number") {
			return [{ start: 0, length, from: value, to: value }];
		}

		if (!value.length) {
			throw new Error("Keyframes should have at least one value.");
		}

		const normalizedKeyframes = this.createNormalizedKeyframes(value);

		try {
			this.validateKeyframes(normalizedKeyframes);
		} catch (error) {
			console.warn("Keyframe configuration issues detected:", error);
		}

		return this.insertFillerKeyframes(normalizedKeyframes, length, initialValue);
	}

	private createNormalizedKeyframes(keyframes: Keyframe[]): Keyframe[] {
		return keyframes
			.toSorted((a, b) => a.start - b.start)
			.map(keyframe => ({ ...keyframe, start: keyframe.start * 1000, length: keyframe.length * 1000 }));
	}

	private validateKeyframes(keyframes: Keyframe[]): void {
		for (let i = 0; i < keyframes.length; i += 1) {
			const current = keyframes[i];
			const next = keyframes[i + 1];

			if (!next) {
				if (current.start + current.length > this.length) {
					throw new Error("Last keyframe exceeds the maximum duration.");
				}

				break;
			}

			if (current.start + current.length > next.start) {
				throw new Error("Overlapping keyframes detected.");
			}
		}
	}

	private insertFillerKeyframes(keyframes: Keyframe[], length: number, initialValue = 0): Keyframe[] {
		const updatedKeyframes: Keyframe[] = [];

		for (let i = 0; i < keyframes.length; i += 1) {
			const current = keyframes[i];
			const next = keyframes[i + 1];

			const shouldFillStart = i === 0 && current.start !== 0;
			if (shouldFillStart) {
				const fillerKeyframe: Keyframe = { start: 0, length: current.start, from: initialValue, to: current.from };
				updatedKeyframes.push(fillerKeyframe);
			}

			updatedKeyframes.push(current);

			if (!next) {
				const shouldFillEnd = current.start + current.length < length;
				if (shouldFillEnd) {
					const currentStart = current.start + current.length;
					const fillerKeyframe: Keyframe = { start: currentStart, length: length - currentStart, from: current.to, to: current.to };

					updatedKeyframes.push(fillerKeyframe);
				}

				break;
			}

			const shouldFillMiddle = current.start + current.length !== next.start;
			if (shouldFillMiddle) {
				const fillerKeyframe: Keyframe = { start: current.start + current.length, length: next.start, from: current.to, to: next.from };
				updatedKeyframes.push(fillerKeyframe);
			}
		}

		return updatedKeyframes;
	}
}
