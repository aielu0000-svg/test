import type { ApiBridge } from "../../preload";

declare global {
  interface Window {
    api: ApiBridge;
  }
}

export {};
