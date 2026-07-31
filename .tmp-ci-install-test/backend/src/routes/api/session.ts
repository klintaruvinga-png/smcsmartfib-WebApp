import { defineEventHandler } from "h3";

export type SessionResponse = {
  name: string;
  openUtc: string;
  closeUtc: string;
  state: "open" | "closed" | "unknown";
  nowUtc: string;
};

type SessionWindow = {
  name: string;
  openUtc: string;
  closeUtc: string;
};

const SESSIONS: SessionWindow[] = [
  { name: "London-AM", openUtc: "07:00", closeUtc: "11:00" },
  { name: "London-PM", openUtc: "12:00", closeUtc: "16:00" },
  { name: "NewYork-AM", openUtc: "13:30", closeUtc: "17:30" },
  { name: "NewYork-PM", openUtc: "18:00", closeUtc: "22:00" },
  { name: "Tokyo", openUtc: "00:00", closeUtc: "09:00" },
];

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map((part) => Number(part));
  return hours * 60 + minutes;
}

function classifySession(now: Date): SessionResponse {
  const nowUtc = now.toISOString().slice(0, 23) + "Z";
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  for (const session of SESSIONS) {
    const start = toMinutes(session.openUtc);
    const end = toMinutes(session.closeUtc);

    if (nowMinutes >= start && nowMinutes < end) {
      return {
        name: session.name,
        openUtc: session.openUtc,
        closeUtc: session.closeUtc,
        state: "open",
        nowUtc,
      };
    }
  }

  return {
    name: "Closed",
    openUtc: "--:--",
    closeUtc: "--:--",
    state: "closed",
    nowUtc,
  };
}

export default defineEventHandler(() => {
  return classifySession(new Date());
});
