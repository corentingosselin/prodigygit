import { useState } from "react";
import type { Profile } from "../lib/api";
import { avatarColor, initials } from "../lib/format";

/** GitHub avatar when the profile has one, colored initials otherwise (or if the image fails). */
export function ProfileAvatar({ profile, small }: { profile: Pick<Profile, "label" | "avatarUrl">; small?: boolean }) {
  const [broken, setBroken] = useState(false);
  const cls = `avatar${small ? " sm" : ""}`;
  if (profile.avatarUrl && !broken) {
    return <img className={`${cls} img`} src={profile.avatarUrl} alt="" onError={() => setBroken(true)} />;
  }
  return (
    <span className={cls} style={{ background: avatarColor(profile.label) }}>
      {initials(profile.label)}
    </span>
  );
}
