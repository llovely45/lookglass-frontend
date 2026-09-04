import { useRef, type KeyboardEvent } from "react";

import type { StatusSnapshot } from "../contracts";

export type DashboardPanel = StatusSnapshot["panels"][number];

export function panelTabId(panelId: string): string {
  return `panel-tab-${panelId}`;
}

export function panelContentId(panelId: string): string {
  return `panel-content-${panelId}`;
}

interface PanelTabsProps {
  panels: readonly DashboardPanel[];
  selectedPanelId: string;
  onSelect: (panelId: string) => void;
}

function moveSelection(
  event: KeyboardEvent<HTMLButtonElement>,
  panels: readonly DashboardPanel[],
  selectedPanelId: string,
  onSelect: (panelId: string) => void,
): void {
  const currentIndex = panels.findIndex((panel) => panel.id === selectedPanelId);
  if (currentIndex < 0 || panels.length < 2) return;

  let nextIndex = currentIndex;
  if (event.key === "ArrowRight") {
    nextIndex = (currentIndex + 1) % panels.length;
  } else if (event.key === "ArrowLeft") {
    nextIndex = (currentIndex - 1 + panels.length) % panels.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = panels.length - 1;
  } else {
    return;
  }

  event.preventDefault();
  onSelect(panels[nextIndex].id);
}

export default function PanelTabs({
  panels,
  selectedPanelId,
  onSelect,
}: PanelTabsProps) {
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  if (panels.length === 0) return null;

  const selectFromKeyboard = (panelId: string): void => {
    onSelect(panelId);
    tabRefs.current.get(panelId)?.focus();
  };

  return (
    <nav className="panel-tabs" aria-label="状态分栏">
      <div className="panel-tab-list" role="tablist" aria-label="状态分栏">
        {panels.map((panel) => {
          const isSelected = panel.id === selectedPanelId;

          return (
            <button
              key={panel.id}
              ref={(element) => {
                if (element) {
                  tabRefs.current.set(panel.id, element);
                } else {
                  tabRefs.current.delete(panel.id);
                }
              }}
              id={panelTabId(panel.id)}
              className={`panel-tab${isSelected ? " panel-tab--selected" : ""}`}
              type="button"
              role="tab"
              aria-controls={isSelected ? panelContentId(panel.id) : undefined}
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => onSelect(panel.id)}
              onKeyDown={(event) =>
                moveSelection(
                  event,
                  panels,
                  selectedPanelId,
                  selectFromKeyboard,
                )
              }
            >
              {panel.logoUrl ? (
                <img className="panel-tab__logo" src={panel.logoUrl} alt="" />
              ) : (
                <span className="panel-tab__mark" aria-hidden="true">
                  {panel.name.charAt(0).toUpperCase()}
                </span>
              )}
              <span>{panel.name}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
