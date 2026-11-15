import React, { useMemo } from "react";
import { Avatar, Style, type StyleDefinition } from "@dicebear/core";
import voxelArt from "@dicebear/styles/voxel-art.json";

const voxelArtStyle = new Style(voxelArt as unknown as StyleDefinition);

interface VoxelAvatarProps {
  seed: string;
  size?: number;
  className?: string;
}

export const VoxelAvatar: React.FC<VoxelAvatarProps> = ({ seed, size = 32, className = "" }) => {
  const svgDataUri = useMemo(() => {
    try {
      const avatar = new Avatar(voxelArtStyle, {
        seed: seed.toLowerCase(),
        size,
      });
      return avatar.toDataUri();
    } catch {
      return "";
    }
  }, [seed, size]);

  if (!svgDataUri) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`bg-zinc-800 rounded-[2px] shrink-0 ${className}`}
      />
    );
  }

  return (
    <img
      src={svgDataUri}
      alt="EOA Voxel Avatar"
      style={{ width: size, height: size }}
      className={`rounded-[2px] object-contain shrink-0 ${className}`}
    />
  );
};

