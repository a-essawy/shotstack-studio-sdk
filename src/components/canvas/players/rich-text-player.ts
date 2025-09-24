import { Player } from "@canvas/players/player";
import { type Size } from "@layouts/geometry";
import { type RichTextAsset } from "@schemas/rich-text-asset";
import { createTextEngine } from "@shotstack/shotstack-canvas";
import * as pixi from "pixi.js";

export class RichTextPlayer extends Player {
	private textEngine: any = null;
	private renderer: any = null;
	private canvas: HTMLCanvasElement | null = null;
	private texture: pixi.Texture | null = null;
	private sprite: pixi.Sprite | null = null;
	private lastRenderedTime: number = -1;
	private cachedFrames = new Map<number, pixi.Texture>();

	private createFontMapping(): Map<string, string> {
		const fontMap = new Map<string, string>();

		fontMap.set("Arapey", "/assets/fonts/Arapey-Regular.ttf");
		fontMap.set("ClearSans", "/assets/fonts/ClearSans-Regular.ttf");
		fontMap.set("Clear Sans", "/assets/fonts/ClearSans-Regular.ttf");
		fontMap.set("DidactGothic", "/assets/fonts/DidactGothic-Regular.ttf");
		fontMap.set("Didact Gothic", "/assets/fonts/DidactGothic-Regular.ttf");
		fontMap.set("Montserrat", "/assets/fonts/Montserrat-SemiBold.ttf");
		fontMap.set("MovLette", "/assets/fonts/MovLette.ttf");
		fontMap.set("OpenSans", "/assets/fonts/OpenSans-Bold.ttf");
		fontMap.set("Open Sans", "/assets/fonts/OpenSans-Bold.ttf");
		fontMap.set("PermanentMarker", "/assets/fonts/PermanentMarker-Regular.ttf");
		fontMap.set("Permanent Marker", "/assets/fonts/PermanentMarker-Regular.ttf");
		fontMap.set("Roboto", "/assets/fonts/Roboto-BlackItalic.ttf");
		fontMap.set("SueEllenFrancisco", "/assets/fonts/SueEllenFrancisco.ttf");
		fontMap.set("Sue Ellen Francisco", "/assets/fonts/SueEllenFrancisco.ttf");
		fontMap.set("UniNeue", "/assets/fonts/UniNeue-Bold.otf");
		fontMap.set("Uni Neue", "/assets/fonts/UniNeue-Bold.otf");
		fontMap.set("WorkSans", "/assets/fonts/WorkSans-Light.ttf");
		fontMap.set("Work Sans", "/assets/fonts/WorkSans-Light.ttf");

		return fontMap;
	}

	public override async load(): Promise<void> {
		await super.load();

		const richTextAsset = this.clipConfiguration.asset as RichTextAsset;

		try {
			this.textEngine = await createTextEngine({
				width: richTextAsset.width || this.edit.size.width,
				height: richTextAsset.height || this.edit.size.height,
				pixelRatio: richTextAsset.pixelRatio || 2,
				fps: 60
			});

			const fontMap = this.createFontMapping();

			this.canvas = document.createElement("canvas");
			this.canvas.width = (richTextAsset.width || this.edit.size.width) * (richTextAsset.pixelRatio || 2);
			this.canvas.height = (richTextAsset.height || this.edit.size.height) * (richTextAsset.pixelRatio || 2);

			this.renderer = this.textEngine.createRenderer(this.canvas);

			const editData = this.edit.getEdit();
			const timelineFonts = editData?.timeline?.fonts || [];

			if (timelineFonts.length > 0) {
				for (const timelineFont of timelineFonts) {
					try {
						const fontDesc = {
							family: richTextAsset.font?.family || "Roboto",
							weight: richTextAsset.font?.weight || "400",
							style: richTextAsset.font?.style || "normal"
						};

						await this.textEngine.registerFontFromUrl(timelineFont.src, fontDesc);
					} catch (error) {
						console.warn(`Failed to load timeline font: ${timelineFont.src}`, error);
					}
				}
			} else if (richTextAsset.font?.family) {
				const fontFamily = richTextAsset.font.family;
				const fontPath = fontMap.get(fontFamily);

				if (fontPath) {
					try {
						const fontDesc = {
							family: richTextAsset.font.family,
							weight: richTextAsset.font.weight || "400",
							style: richTextAsset.font.style || "normal"
						};

						await this.textEngine.registerFontFromFile(fontPath, fontDesc);
					} catch (error) {
						console.warn(`Failed to load local font: ${fontFamily}`, error);
					}
				} else {
					console.warn(`Font ${fontFamily} not found in local assets. Available fonts:`, Array.from(fontMap.keys()));
				}
			}

			await this.renderFrame(0);
			this.configureKeyframes();
		} catch (error) {
			console.error("Failed to initialize rich text player:", error);
			this.createFallbackText(richTextAsset);
		}
	}

	private async renderFrame(timeSeconds: number): Promise<void> {
		if (!this.textEngine || !this.renderer || !this.canvas) return;

		const richTextAsset = this.clipConfiguration.asset as RichTextAsset;
		const cacheKey = Math.floor(timeSeconds * 30);
		if (richTextAsset.cacheEnabled && this.cachedFrames.has(cacheKey)) {
			const cachedTexture = this.cachedFrames.get(cacheKey)!;
			if (this.sprite) this.sprite.texture = cachedTexture;
			return;
		}

		try {
			const { value: validated } = this.textEngine.validate(richTextAsset);
			const ops = await this.textEngine.renderFrame(validated, timeSeconds);

			const ctx = this.canvas.getContext("2d");
			if (ctx) ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

			await this.renderer.render(ops);

			const tex = pixi.Texture.from(this.canvas);

			if (!this.sprite) {
				this.sprite = new pixi.Sprite(tex);
				this.sprite.scale.set(1 / (richTextAsset.pixelRatio || 2));
				this.contentContainer.addChild(this.sprite);
			} else {
				if (this.texture && !this.cachedFrames.has(cacheKey)) this.texture.destroy();
				this.sprite.texture = tex;
			}

			this.texture = tex;
			if (richTextAsset.cacheEnabled && this.cachedFrames.size < 100) {
				this.cachedFrames.set(cacheKey, tex);
			}

			this.lastRenderedTime = timeSeconds;
		} catch (err) {
			console.error("Failed to render rich text frame:", err);
		}
	}

	private createFallbackText(richTextAsset: RichTextAsset): void {
		const style = new pixi.TextStyle({
			fontFamily: richTextAsset.font?.family || "Arial",
			fontSize: richTextAsset.font?.size || 48,
			fill: richTextAsset.font?.color || "#ffffff",
			align: richTextAsset.align?.horizontal || "center",
			wordWrap: true,
			wordWrapWidth: richTextAsset.width || this.edit.size.width
		});

		const fallbackText = new pixi.Text(richTextAsset.text, style);

		const containerWidth = richTextAsset.width || this.edit.size.width;
		const containerHeight = richTextAsset.height || this.edit.size.height;

		switch (richTextAsset.align?.horizontal) {
			case "left":
				fallbackText.anchor.set(0, 0.5);
				fallbackText.x = 0;
				break;
			case "right":
				fallbackText.anchor.set(1, 0.5);
				fallbackText.x = containerWidth;
				break;
			default:
				fallbackText.anchor.set(0.5, 0.5);
				fallbackText.x = containerWidth / 2;
		}

		switch (richTextAsset.align?.vertical) {
			case "top":
				fallbackText.anchor.set(fallbackText.anchor.x, 0);
				fallbackText.y = 0;
				break;
			case "bottom":
				fallbackText.anchor.set(fallbackText.anchor.x, 1);
				fallbackText.y = containerHeight;
				break;
			default:
				fallbackText.anchor.set(fallbackText.anchor.x, 0.5);
				fallbackText.y = containerHeight / 2;
		}

		this.contentContainer.addChild(fallbackText);
	}

	public override update(deltaTime: number, elapsed: number): void {
		super.update(deltaTime, elapsed);

		if (this.textEngine && this.renderer) {
			const currentTimeSeconds = this.getCurrentTime() / 1000;

			if (Math.abs(currentTimeSeconds - this.lastRenderedTime) > 0.033) {
				this.renderFrame(currentTimeSeconds);
			}
		}
	}

	public override dispose(): void {
		super.dispose();

		for (const texture of this.cachedFrames.values()) {
			texture.destroy();
		}
		this.cachedFrames.clear();

		if (this.texture && !this.cachedFrames.has(Math.floor(this.lastRenderedTime * 30))) {
			this.texture.destroy();
		}
		this.texture = null;

		if (this.sprite) {
			this.sprite.destroy();
			this.sprite = null;
		}

		if (this.canvas) {
			this.canvas = null;
		}

		if (this.textEngine) {
			this.textEngine.destroy();
			this.textEngine = null;
		}

		this.renderer = null;
	}

	public override getSize(): Size {
		const richTextAsset = this.clipConfiguration.asset as RichTextAsset;
		return {
			width: richTextAsset.width || this.edit.size.width,
			height: richTextAsset.height || this.edit.size.height
		};
	}

	protected override getFitScale(): number {
		return 1;
	}

	public updateTextContent(newText: string): void {
		const richTextAsset = this.clipConfiguration.asset as RichTextAsset;
		richTextAsset.text = newText;

		for (const texture of this.cachedFrames.values()) {
			texture.destroy();
		}
		this.cachedFrames.clear();

		this.lastRenderedTime = -1;
		if (this.textEngine && this.renderer) {
			this.renderFrame(this.getCurrentTime() / 1000);
		}
	}

	private getCurrentTime(): number {
		return this.edit.playbackTime;
	}
}
