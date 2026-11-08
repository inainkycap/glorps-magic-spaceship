import Sprite from "./Sprite";

/** The diversity icon: the diversity-icon sprite, or a ◆ until it's drawn. `small` = 1× for cards. */
export default function DiversityIcon({ small = false }: { small?: boolean }) {
  return (
    <Sprite
      name="diversity-icon"
      width={16}
      height={16}
      scale={small ? 1 : 2}
      fallback={
        <span className={`diversity-fallback${small ? " small" : ""}`} aria-hidden="true">
          ◆
        </span>
      }
    />
  );
}
