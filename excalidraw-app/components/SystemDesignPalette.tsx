import { CaptureUpdateAction, useExcalidrawAPI } from "@excalidraw/excalidraw";
import { newElement, newTextElement } from "@excalidraw/element";
import { randomId } from "@excalidraw/common";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowIcon,
  DiamondIcon,
  EllipseIcon,
  LibraryIcon,
  LockedIcon,
  RectangleIcon,
  TextIcon,
  UnlockedIcon,
} from "@excalidraw/excalidraw/components/icons";

type PaletteItem = {
  id: string;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
  insert: (x: number, y: number) => void;
};

const STROKE = "#1f1f1f";
const FONT_SIZE = 22;

export const SystemDesignPalette = () => {
  const excalidrawAPI = useExcalidrawAPI();
  const rootRef = useRef<HTMLDivElement>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);

  const insertElements = useCallback(
    (elementsFactory: () => any[]) => {
      if (!excalidrawAPI) {
        return;
      }

      const nextElements = elementsFactory();
      const currentElements = excalidrawAPI.getSceneElements();
      const selectedElementIds = Object.fromEntries(
        nextElements.map((element) => [element.id, true]),
      );

      excalidrawAPI.updateScene({
        elements: [...currentElements, ...nextElements],
        appState: {
          ...excalidrawAPI.getAppState(),
          selectedElementIds,
        },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
    },
    [excalidrawAPI],
  );

  const makeLabeledRect = useCallback(
    (
      x: number,
      y: number,
      label: string,
      opts: {
        width?: number;
        height?: number;
        backgroundColor: string;
        roundness?: { type: 2 } | null;
        fillStyle?: "hachure" | "cross-hatch" | "solid" | "zigzag";
      },
    ) => {
      insertElements(() => {
        const width = opts.width ?? 220;
        const height = opts.height ?? 84;
        const groupId = randomId();
        const origin = { x: x - width / 2, y: y - height / 2 };

        const container = newElement({
          type: "rectangle",
          x: origin.x,
          y: origin.y,
          width,
          height,
          strokeColor: STROKE,
          backgroundColor: opts.backgroundColor,
          fillStyle: opts.fillStyle ?? "hachure",
          strokeWidth: 2,
          roughness: 1,
          roundness: opts.roundness ?? { type: 2 },
          groupIds: [groupId],
        });

        const text = newTextElement({
          x,
          y,
          text: label,
          fontSize: FONT_SIZE,
          strokeColor: STROKE,
          backgroundColor: "transparent",
          textAlign: "center",
          verticalAlign: "middle",
          groupIds: [groupId],
        });

        return [container, text];
      });
    },
    [insertElements],
  );

  const makeLabeledEllipse = useCallback(
    (x: number, y: number, label: string, backgroundColor: string) => {
      insertElements(() => {
        const width = 180;
        const height = 180;
        const groupId = randomId();
        const origin = { x: x - width / 2, y: y - height / 2 };

        const container = newElement({
          type: "ellipse",
          x: origin.x,
          y: origin.y,
          width,
          height,
          strokeColor: STROKE,
          backgroundColor,
          fillStyle: "hachure",
          strokeWidth: 2,
          roughness: 1,
          groupIds: [groupId],
        });

        const text = newTextElement({
          x,
          y,
          text: label,
          fontSize: FONT_SIZE,
          strokeColor: STROKE,
          backgroundColor: "transparent",
          textAlign: "center",
          verticalAlign: "middle",
          groupIds: [groupId],
        });

        return [container, text];
      });
    },
    [insertElements],
  );

  const makeQueue = useCallback(
    (x: number, y: number) => {
      insertElements(() => {
        const width = 320;
        const height = 96;
        const groupId = randomId();
        const origin = { x: x - width / 2, y: y - height / 2 };

        const outer = newElement({
          type: "rectangle",
          x: origin.x,
          y: origin.y,
          width,
          height,
          strokeColor: "#e67700",
          backgroundColor: "#ffe8cc",
          fillStyle: "hachure",
          strokeWidth: 2,
          roughness: 1,
          roundness: { type: 2 },
          groupIds: [groupId],
        });

        const item1 = newElement({
          type: "rectangle",
          x: origin.x + 24,
          y: origin.y + 22,
          width: 52,
          height: 52,
          strokeColor: "#e67700",
          backgroundColor: "#fff3bf",
          fillStyle: "cross-hatch",
          strokeWidth: 2,
          roughness: 1,
          groupIds: [groupId],
        });
        const item2 = newElement({
          type: "rectangle",
          x: origin.x + 96,
          y: origin.y + 22,
          width: 52,
          height: 52,
          strokeColor: "#e67700",
          backgroundColor: "#fff3bf",
          fillStyle: "cross-hatch",
          strokeWidth: 2,
          roughness: 1,
          groupIds: [groupId],
        });
        const item3 = newElement({
          type: "rectangle",
          x: origin.x + 248,
          y: origin.y + 22,
          width: 52,
          height: 52,
          strokeColor: "#e67700",
          backgroundColor: "#fff3bf",
          fillStyle: "cross-hatch",
          strokeWidth: 2,
          roughness: 1,
          groupIds: [groupId],
        });

        const label = newTextElement({
          x,
          y: origin.y + height + 28,
          text: "Message Queue",
          fontSize: 20,
          strokeColor: STROKE,
          backgroundColor: "transparent",
          textAlign: "center",
          verticalAlign: "middle",
          groupIds: [groupId],
        });

        return [outer, item1, item2, item3, label];
      });
    },
    [insertElements],
  );

  const makeDatabase = useCallback(
    (x: number, y: number) => {
      insertElements(() => {
        const width = 170;
        const bodyHeight = 110;
        const topHeight = 38;
        const groupId = randomId();
        const totalHeight = bodyHeight + topHeight;
        const origin = { x: x - width / 2, y: y - totalHeight / 2 };

        const top = newElement({
          type: "ellipse",
          x: origin.x,
          y: origin.y,
          width,
          height: topHeight,
          strokeColor: "#2b8a3e",
          backgroundColor: "#d3f9d8",
          fillStyle: "hachure",
          strokeWidth: 2,
          roughness: 1,
          groupIds: [groupId],
        });
        const body = newElement({
          type: "rectangle",
          x: origin.x,
          y: origin.y + topHeight / 2,
          width,
          height: bodyHeight,
          strokeColor: "#2b8a3e",
          backgroundColor: "#d3f9d8",
          fillStyle: "hachure",
          strokeWidth: 2,
          roughness: 1,
          groupIds: [groupId],
        });
        const bottom = newElement({
          type: "ellipse",
          x: origin.x,
          y: origin.y + bodyHeight,
          width,
          height: topHeight,
          strokeColor: "#2b8a3e",
          backgroundColor: "#d3f9d8",
          fillStyle: "hachure",
          strokeWidth: 2,
          roughness: 1,
          groupIds: [groupId],
        });
        const text = newTextElement({
          x,
          y: origin.y + bodyHeight / 2 + 18,
          text: "DB",
          fontSize: 28,
          strokeColor: STROKE,
          backgroundColor: "transparent",
          textAlign: "center",
          verticalAlign: "middle",
          groupIds: [groupId],
        });

        return [body, top, bottom, text];
      });
    },
    [insertElements],
  );

  const items: PaletteItem[] = useMemo(
    () => [
      {
        id: "api-gateway",
        label: "API Gateway",
        shortcut: "1",
        icon: RectangleIcon,
        insert: (x, y) =>
          makeLabeledRect(x, y, "API Gateway", {
            backgroundColor: "#d0ebff",
          }),
      },
      {
        id: "load-balancer",
        label: "Load Balancer",
        shortcut: "2",
        icon: DiamondIcon,
        insert: (x, y) =>
          makeLabeledRect(x, y, "Load Balancer", {
            backgroundColor: "#ffe8cc",
          }),
      },
      {
        id: "service",
        label: "Service",
        shortcut: "3",
        icon: RectangleIcon,
        insert: (x, y) =>
          makeLabeledRect(x, y, "Service", {
            backgroundColor: "#d3f9d8",
          }),
      },
      {
        id: "worker",
        label: "Worker",
        shortcut: "4",
        icon: RectangleIcon,
        insert: (x, y) =>
          makeLabeledRect(x, y, "Worker", {
            backgroundColor: "#f3d9fa",
          }),
      },
      {
        id: "queue",
        label: "Message Queue",
        shortcut: "5",
        icon: ArrowIcon,
        insert: makeQueue,
      },
      {
        id: "topic",
        label: "Topic",
        shortcut: "6",
        icon: EllipseIcon,
        insert: (x, y) => makeLabeledEllipse(x, y, "Topic", "#fff3bf"),
      },
      {
        id: "db",
        label: "Database",
        shortcut: "7",
        icon: LibraryIcon,
        insert: makeDatabase,
      },
      {
        id: "cache",
        label: "Cache",
        shortcut: "8",
        icon: RectangleIcon,
        insert: (x, y) =>
          makeLabeledRect(x, y, "Cache", {
            backgroundColor: "#e5dbff",
          }),
      },
      {
        id: "producer",
        label: "Producer",
        shortcut: "9",
        icon: EllipseIcon,
        insert: (x, y) => makeLabeledEllipse(x, y, "Producer", "#ffc9c9"),
      },
      {
        id: "consumer",
        label: "Consumer",
        shortcut: "0",
        icon: TextIcon,
        insert: (x, y) => makeLabeledEllipse(x, y, "Consumer", "#d8f5a2"),
      },
    ],
    [makeDatabase, makeLabeledEllipse, makeLabeledRect, makeQueue],
  );

  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }

    if (activeItemId) {
      excalidrawAPI.setCursor("crosshair");
    } else {
      excalidrawAPI.resetCursor();
    }

    return () => {
      excalidrawAPI.resetCursor();
    };
  }, [activeItemId, excalidrawAPI]);

  useEffect(() => {
    if (!activeItemId || !excalidrawAPI) {
      return;
    }

    const activeInsert =
      items.find((item) => item.id === activeItemId)?.insert ?? null;
    if (!activeInsert) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      // Only place a shape when the click actually lands on the drawing
      // canvas. Anything else (top toolbar, side panels, our own sidebar,
      // dialogs, etc.) should behave like a normal UI click.
      const target = event.target as HTMLElement;
      if (!target.closest?.(".excalidraw__canvas")) {
        return;
      }

      const appState = excalidrawAPI.getAppState();
      const x = event.clientX - appState.offsetLeft - appState.scrollX;
      const y = event.clientY - appState.offsetTop - appState.scrollY;
      activeInsert(x, y);

      // Single-shot by default, mirroring Excalidraw's own shape tools:
      // place one element, then fall back to the selection tool. Locking
      // keeps the tool armed for stamping multiple copies in a row.
      if (!isLocked) {
        setActiveItemId(null);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveItemId(null);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeItemId, excalidrawAPI, isLocked, items]);

  return (
    <div
      ref={rootRef}
      className="system-design-toolbar"
      aria-label="System design toolbar"
    >
      <div className="system-design-toolbar__header">
        <span>SD</span>
        <button
          className={`system-design-toolbar__lock${
            isLocked ? " system-design-toolbar__lock--active" : ""
          }`}
          onClick={() => setIsLocked((current) => !current)}
          type="button"
          title={
            isLocked
              ? "Tool stays active after placing (click to disable)"
              : "Tool deactivates after placing (click to keep it active)"
          }
          aria-label="Keep tool active after placing a shape"
          aria-pressed={isLocked}
        >
          {isLocked ? LockedIcon : UnlockedIcon}
        </button>
      </div>
      <div className="system-design-toolbar__items">
        {items.map((item) => (
          <button
            key={item.id}
            className={`system-design-toolbar__item${
              activeItemId === item.id
                ? " system-design-toolbar__item--active"
                : ""
            }`}
            onClick={() =>
              setActiveItemId((current) =>
                current === item.id ? null : item.id,
              )
            }
            type="button"
            title={item.label}
            aria-label={item.label}
          >
            <span className="system-design-toolbar__icon">{item.icon}</span>
            <span className="system-design-toolbar__shortcut">
              {item.shortcut}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
