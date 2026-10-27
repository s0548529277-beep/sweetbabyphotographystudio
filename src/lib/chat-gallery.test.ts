import { describe, expect, test } from "bun:test";
import { publicChatPhotos } from "./chat-gallery";

describe("public chatbot gallery", () => {
  const row = (url: string, hidden = false, source = "upload") => ({ url, hidden, source, caption: null });
  test("never exposes hidden photos or configuration rows", () => {
    expect(publicChatPhotos([row("/hidden.jpg", true), row("/settings.jpg", false, "config"), row("/visible.jpg")]))
      .toEqual([{ url: "/visible.jpg", caption: "" }]);
  });
  test("deduplicates photos and keeps the first four in gallery order", () => {
    expect(publicChatPhotos([row("/1.jpg"), row("/1.jpg"), row("/2.jpg"), row("/3.jpg"), row("/4.jpg"), row("/5.jpg")]).map((photo) => photo.url))
      .toEqual(["/1.jpg", "/2.jpg", "/3.jpg", "/4.jpg"]);
  });
});