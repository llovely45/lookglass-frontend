import { useState, type ReactNode } from "react";

interface SortableListProps<T extends { id: string }> {
  items: readonly T[];
  getItemLabel: (item: T) => string;
  onMove: (fromIndex: number, toIndex: number) => void | Promise<void>;
  renderItem: (item: T, index: number) => ReactNode;
  emptyMessage?: string;
}

export default function SortableList<T extends { id: string }>({
  items,
  getItemLabel,
  onMove,
  renderItem,
  emptyMessage = "暂无内容。",
}: SortableListProps<T>) {
  const [movingId, setMovingId] = useState<string | null>(null);

  async function move(item: T, fromIndex: number, toIndex: number): Promise<void> {
    if (toIndex < 0 || toIndex >= items.length || movingId !== null) return;

    setMovingId(item.id);
    try {
      await onMove(fromIndex, toIndex);
    } finally {
      setMovingId(null);
    }
  }

  if (items.length === 0) {
    return <p className="empty-list">{emptyMessage}</p>;
  }

  return (
    <ol className="sortable-list">
      {items.map((item, index) => {
        const label = getItemLabel(item);
        const isMoving = movingId === item.id;

        return (
          <li className="sortable-list__item" key={item.id}>
            <div className="sortable-list__content">{renderItem(item, index)}</div>
            <div className="sortable-list__controls" aria-label={`排序：${label}`}>
              <button
                className="icon-button"
                type="button"
                aria-label={`上移 ${label}`}
                title={`上移 ${label}`}
                disabled={index === 0 || movingId !== null}
                onClick={() => void move(item, index, index - 1)}
              >
                ↑
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label={`下移 ${label}`}
                title={`下移 ${label}`}
                disabled={index === items.length - 1 || movingId !== null}
                onClick={() => void move(item, index, index + 1)}
              >
                ↓
              </button>
              {isMoving ? <span className="sr-only">正在保存排序…</span> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
