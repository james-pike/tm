import { component$ } from "@builder.io/qwik";

/**
 * A product photo. Serves the .webp sibling that scripts/optimize-images.ts
 * writes next to every image, falling back to the original file — whose path
 * comes from the Turso DB via products.ts and so isn't ours to rename.
 *
 * The <picture> wrapper is inert for layout (the <img> inside is what the CSS
 * targets, e.g. .product-card__image img).
 */
export const ProductImage = component$<{
  src: string;
  alt: string;
  width: number;
  height: number;
  class?: string;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
  decoding?: "sync" | "async" | "auto";
}>(({ src, alt, width, height, class: cls, loading = "lazy", fetchPriority = "auto", decoding = "async" }) => {
  const webp = src.replace(/\.(jpe?g|png)$/i, ".webp");

  return (
    <picture>
      {webp !== src && <source srcset={webp} type="image/webp" />}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        class={cls}
        loading={loading}
        fetchPriority={fetchPriority}
        decoding={decoding}
      />
    </picture>
  );
});
