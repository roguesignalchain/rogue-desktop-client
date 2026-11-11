import React, { useMemo } from "react";
import { createAvatar } from "@dicebear/core";
import { bottts } from "@dicebear/collection";

interface VoxelAvatarProps {
  seed: string;
  size?: number;
  className?: string;
}

export const VoxelAvatar: React.FC<VoxelAvatarProps> = ({ seed, size = 32, className = "" }) => {
  const svgDataUri = useMemo(() => {
    try {
      const avatar = createAvatar(bottts, {
        seed: seed.toLowerCase(),
        size,
      });
      return `data:image/svg+xml;utf8,${encodeURIComponent(avatar.toString())}`;
    } catch (e) {
      console.warn("Error rendering voxel bot avatar:", e);
      return "";
    }
  }, [seed, size]);

  if (!svgDataUri) {
    return <div className={`w-[${size}px] h-[${size}px] bg-zinc-800 rounded-[2px] ${className}`} />;
  }

  return (
    <img
      src={svgDataUri}
      alt="Miner Avatar"
      style={{ width: size, height: size }}
      className={`rounded-[2px] object-contain shrink-0 ${className}`}
    />
  );
};

