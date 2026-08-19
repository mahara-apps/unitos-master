import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { SOCIAL_NETWORKS, type SocialNetworkKey } from "@/lib/calendar-tokens";

export function SocialIconsRow({
  networks,
  max = 4,
  size = "sm",
}: {
  networks: SocialNetworkKey[];
  max?: number;
  size?: "xs" | "sm";
}) {
  if (networks.length === 0) return null;
  const visible = networks.slice(0, max);
  const overflow = networks.length - visible.length;
  const iconClass = size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5";
  return (
    <div className="flex items-center gap-1">
      {visible.map((key) => {
        const meta = SOCIAL_NETWORKS[key];
        const Icon = meta.Icon;
        return (
          <Tooltip key={key}>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "inline-flex items-center justify-center rounded-sm text-muted-foreground transition-colors",
                  meta.hoverColor,
                )}
                aria-label={meta.label}
              >
                <Icon className={iconClass} strokeWidth={2} />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-[10px]">
              {meta.label}
            </TooltipContent>
          </Tooltip>
        );
      })}
      {overflow > 0 ? (
        <span className="text-[10px] font-medium tabular-nums text-muted-foreground/80">
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}
