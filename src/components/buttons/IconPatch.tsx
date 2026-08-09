import { Icon, Icons } from "@/components/Icon";

export interface IconPatchProps {
  active?: boolean;
  onClick?: () => void;
  clickable?: boolean;
  className?: string;
  icon: Icons;
  transparent?: boolean;
  downsized?: boolean;
  navigation?: boolean;
}

export function IconPatch(props: IconPatchProps) {
  const clickableClasses = props.clickable
    ? "cursor-pointer hover:scale-110 hover:bg-pill-backgroundHover hover:text-white active:scale-125"
    : "";
  const transparentClasses = props.transparent
    ? "bg-opacity-0 hover:bg-opacity-50"
    : "";
  const navigationClasses = props.navigation
    ? "bg-opacity-50 hover:bg-opacity-100"
    : "";
  const activeClasses = props.active
    ? "bg-pill-backgroundHover text-white"
    : "";
  const sizeClasses = props.downsized ? "h-10 w-10" : "h-12 w-12";

  // Only a control when it carries its own handler. Most call sites wrap it in
  // a <button> or an <a> and pass none — those must not gain a second tab stop
  // sitting inside the first.
  const onClick = props.onClick;
  const interactive = !!onClick;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!onClick) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault(); // Space would otherwise scroll the page
    onClick();
  };

  return (
    <div
      className={
        interactive
          ? `tabbable rounded-full ${props.className ?? ""}`
          : props.className || undefined
      }
      onClick={onClick}
      onKeyDown={interactive ? handleKeyDown : undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
    >
      <div
        className={`flex items-center justify-center rounded-full border-2 border-transparent bg-pill-background bg-opacity-100 transition-[background-color,color,transform,border-color] duration-75 ${transparentClasses} ${navigationClasses} ${clickableClasses} ${activeClasses} ${sizeClasses}`}
      >
        <Icon icon={props.icon} />
      </div>
    </div>
  );
}
