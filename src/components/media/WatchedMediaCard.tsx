import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useMemo } from "react";

import { getProgressPercentage, useProgressStore } from "@/stores/progress";
import {
  ShowProgressResult,
  shouldShowProgress,
} from "@/stores/progress/utils";
import { MediaItem } from "@/utils/media/mediaTypes";

import { MediaCard } from "./MediaCard";

function formatSeries(series?: ShowProgressResult | null) {
  if (!series || !series.episode || !series.season) return undefined;
  return {
    episode: series.episode?.number,
    season: series.season?.number,
    episodeId: series.episode?.id,
    seasonId: series.season?.id,
  };
}

export interface WatchedMediaCardProps {
  media: MediaItem;
  closable?: boolean;
  onClose?: () => void;
  onShowDetails?: (media: MediaItem) => void;
  editable?: boolean;
  onEdit?: (e?: React.MouseEvent) => void;
}

export function WatchedMediaCard(props: WatchedMediaCardProps) {
  const progressItems = useProgressStore((s) => s.items);
  const item = useMemo(() => {
    return progressItems[props.media.id];
  }, [progressItems, props.media]);
  const itemToDisplay = useMemo(
    () => (item ? shouldShowProgress(item) : null),
    [item],
  );
  const percentage = itemToDisplay?.show
    ? getProgressPercentage(
        itemToDisplay.progress.watched,
        itemToDisplay.progress.duration,
      )
    : undefined;

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: props.media.id,
      disabled: !props.editable,
      data: {
        media: props.media,
      },
    });

  const style = {
    // Only apply transform horizontally & vertically so it actually drags around
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : "auto",
    cursor: props.editable ? (isDragging ? "grabbing" : "grab") : "auto",
  };

  // dnd-kit puts `tabIndex={0}` and `role="button"` on its draggable node so a
  // keyboard sensor has a handle to grab. There is no keyboard sensor here --
  // BookmarksGrid registers `PointerSensor` alone -- so this wrapper was a focus
  // stop on every card in the app that does nothing when activated, and it sits
  // outside the card, so it is the one focus lands on first.
  const { tabIndex: _drag, role: _dragRole, ...dragAttributes } = attributes;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...dragAttributes}
      {...listeners}
      className={
        isDragging
          ? "pointer-events-none touch-none"
          : props.editable
            ? "touch-none"
            : ""
      }
    >
      <MediaCard
        media={props.media}
        series={formatSeries(itemToDisplay)}
        linkable
        percentage={percentage}
        onClose={props.onClose}
        closable={props.closable}
        onShowDetails={props.onShowDetails}
        editable={props.editable}
        onEdit={props.onEdit}
      />
    </div>
  );
}
