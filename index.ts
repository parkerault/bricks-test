interface Point {
  x: number;
  y: number;
}

interface Rect extends Point {
  readonly width: number;
  readonly height: number;
}

interface Sheet {
  readonly columnCount: number;
  readonly rowCount: number;
  readonly dimensions: Point; // in pixels
}

interface Cell {
  readonly column: number;
  readonly row: number;
  readonly position: Point;
  readonly text: string;
  node: HTMLElement | null;
  dirty: boolean;
}

interface WindowReaderInstance {
  scrollX: () => number;
  scrollY: () => number;
  innerWidth: () => number;
  innerHeight: () => number;
}

interface DocumentProvider {
  createElement: typeof document.createElement;
  appendChild: typeof document.appendChild;
}

/**
 * Note: The `rows`, `cols`, and `cells` properties represent the lists of
 * elements actually rendered in the document. That is, `cells` does not
 * contain the entire list of virtual cell data, just references to the cell
 * elements that are currently being used to render the virtual cell data when
 * it is on screen.
 */
interface State {
  readonly sheet: Sheet;
  readonly viewportRect: Rect;
  readonly visibleColumns: readonly number[];
  readonly visibleRows: readonly number[];
  readonly cells: readonly Cell[];
  readonly defaultCellDimensions: Point;
  readonly window: WindowReaderInstance;
}

interface ScrollAction {
  readonly type: "scroll";
}

interface InitAction {
  readonly type: "init";
}

type Actions = ScrollAction | InitAction;

interface StateReducerInput {
  readonly state: State;
  readonly action: Actions;
}

interface StateReducer {
  (input: StateReducerInput): StateReducerInput;
}

const defaultState: State = {
  sheet: {
    columnCount: 500,
    rowCount: 500,
    dimensions: { x: 0, y: 0 },
  },
  viewportRect: { x: 0, y: 0, width: 0, height: 0 },
  visibleColumns: [],
  visibleRows: [],
  cells: [],
  defaultCellDimensions: { x: 120, y: 40 },
  window: windowReader(window),
};

/**
 * -----------------------------------------------------------------------------
 * SHEET REDUCER
 * -----------------------------------------------------------------------------
 */

const sheetReducer: StateReducer = ({ state, action }) => {
  switch (action.type) {
    case "init": {
      const dimensions: Point = {
        x: state.sheet.columnCount * state.defaultCellDimensions.x,
        y: state.sheet.rowCount * state.defaultCellDimensions.y,
      };
      return {
        action,
        state: {
          ...state,
          sheet: {
            ...state.sheet,
            dimensions,
          },
        },
      };
    }
    default:
      return { state, action };
  }
};

/**
 * -----------------------------------------------------------------------------
 * VIEWPORT RECT REDUCER
 * -----------------------------------------------------------------------------
 */

const viewportRectReducer: StateReducer = ({ state, action }) => {
  switch (action.type) {
    case "init":
      return {
        action,
        state: {
          ...state,
          viewportRect: {
            x: state.window.scrollX(),
            y: state.window.scrollY(),
            width: state.window.innerWidth(),
            height: state.window.innerHeight(),
          },
        },
      };
    case "scroll":
      return {
        action,
        state: {
          ...state,
          viewportRect: {
            ...state.viewportRect,
            x: state.window.scrollX(),
            y: state.window.scrollY(),
          },
        },
      };
    default:
      return { state, action };
  }
};

/**
 * -----------------------------------------------------------------------------
 * CELLS REDUCER
 * -----------------------------------------------------------------------------
 */

function cellConstructor(dimensions: Point, column: number, row: number): Cell {
  return {
    column,
    row,
    text: `${column}:${row}`,
    position: { x: column * dimensions.x, y: row * dimensions.y },
    node: null,
    dirty: true,
  };
}

function getVisibleColumns(
  viewportRect: Rect,
  cellDimensions: Point,
): number[] {
  const columnsFromOrigin = Math.floor(viewportRect.x / cellDimensions.x);
  const visibleColumnCount = Math.ceil(viewportRect.width / cellDimensions.x);
  return Array.from({ length: visibleColumnCount }).map(
    (_, i) => columnsFromOrigin + i,
  );
}

function getVisibleRows(viewportRect: Rect, cellDimensions: Point): number[] {
  const rowsFromOrigin = Math.floor(viewportRect.y / cellDimensions.y);
  const visibleRowCount = Math.ceil(viewportRect.height / cellDimensions.y);
  return Array.from({ length: visibleRowCount }).map(
    (_, i) => rowsFromOrigin + i,
  );
}

function diffGroups(prev: number[], next: number[]) {
  // Use a set for faster lookup
  const prevSet = new Set(prev);
  const nextSet = new Set(next);
  const added = next.filter((x) => !prevSet.has(x));
  const removed = prev.filter((x) => !nextSet.has(x));
  return { added, removed };
}

const cellsReducer: StateReducer = ({ state, action }) => {
  const {
    viewportRect,
    defaultCellDimensions: cellDimensions,
  } = state;
  switch (action.type) {
    case "init": {
      let cells: Cell[] = [];
      const visibleColumns = getVisibleColumns(viewportRect, cellDimensions);
      const visibleRows = getVisibleRows(viewportRect, cellDimensions);
      const rowStart = visibleRows[0];
      const rowEnd = visibleRows[visibleRows.length - 1];
      const columnStart = visibleColumns[0];
      const columnEnd = visibleColumns[visibleColumns.length - 1];
      for (let row = rowStart; row <= rowEnd; row++) {
        for (let column = columnStart; column <= columnEnd; column++) {
          const cell = cellConstructor(cellDimensions, column, row);
          cells.push(cell);
        }
      }
      return {
        action,
        state: {
          ...state,
          visibleColumns,
          visibleRows,
          cells,
        },
      };
    }

    case "scroll": {
      const visible = {
        columns: getVisibleColumns(viewportRect, cellDimensions),
        rows: getVisibleRows(viewportRect, cellDimensions),
      };
      const columnsDiff = diffGroups(
        state.visibleColumns.concat(),
        visible.columns,
      );
      const rowsDiff = diffGroups(state.visibleRows.concat(), visible.rows);
      // here we are assuming that the removed list has the same length as the
      // added list. We have to loop over every cell twice to move columns and
      // rows separately.
      const cells = state.cells.map((cell) => {
        const colIdx = columnsDiff.removed.indexOf(cell.column);
        const rowIdx = rowsDiff.removed.indexOf(cell.row);
        if (colIdx < 0 && rowIdx < 0) return cell;
        let column = cell.column;
        let row = cell.row;
        let position: Point = { ...cell.position };
        let dirty = false;
        if (colIdx >= 0) {
          column = columnsDiff.added[colIdx];
          position.x = column * cellDimensions.x;
          dirty = true;
        }
        if (rowIdx >= 0) {
          row = rowsDiff.added[rowIdx];
          position.y = row * cellDimensions.y;
          dirty = true;
        }
        if (dirty === true) {
          return {
            ...cell,
            column,
            row,
            position,
            text: `${column}:${row}`,
            dirty,
          };
        }
        return cell;
      });
      return {
        action,
        state: {
          ...state,
          visibleColumns: visible.columns,
          visibleRows: visible.rows,
          cells,
        },
      };
    }
    default:
      return { state, action };
  }
};;;;;;

const reducer: StateReducer = pipeReducers(
  sheetReducer,
  viewportRectReducer,
  cellsReducer,
);

function renderUnsafe(state: State): void {
  const { cells } = state;
  const len = cells.length;
  const batchSize = 250;
  let idx = 0;
  const renderCell = () => {
    const end = idx + batchSize <= len ? idx + batchSize : len;
    const slice = cells.slice(idx, end);
    for (let cell of slice) {
      if (cell.dirty) {
        const {
          position: { x, y },
        } = cell;
        cell.node!.style.transform = `translate(${x}px, ${y}px)`;
        cell.node!.innerText = cell.text;
        cell.dirty = false;
      }
    }
    idx = end;
    if (idx < len) requestAnimationFrame(renderCell);
  };

  requestAnimationFrame(renderCell);
}

function init(root: HTMLElement, head: HTMLElement): void {
  let { state } = reducer({
    state: defaultState,
    action: { type: "init" },
  });
  const stylesheet = initializeStylesheet(state.defaultCellDimensions, {
    x: state.sheet.columnCount,
    y: state.sheet.rowCount,
  });
  head.appendChild(stylesheet);
  const fragment = document.createDocumentFragment();
  const sheetNode = document.createElement("div");
  sheetNode.className = "sheet";
  const cellNodes = state.cells.map((cell) => {
    const cellNode = document.createElement("span");
    cellNode.className = "cell";
    cellNode.style.transform = `translate(${cell.position.x}px, ${cell.position.y}px)`;
    cellNode.innerText = cell.text;
    cell.dirty = false; // Bad, but I can't think of a better way.
    cell.node = cellNode;
    return cellNode;
  });
  fragment.appendChild(sheetNode);
  cellNodes.forEach((node) => {
    sheetNode.appendChild(node);
  });
  root.appendChild(fragment);
  const scroll = () => {
    const { state: nextState } = reducer({ state, action: { type: "scroll" } });
    renderUnsafe(nextState);
    state = nextState;
  };
  const onScroll = throttle(scroll, 32);
  document.addEventListener("scroll", onScroll, { passive: true });
}

const root = document.getElementById("root");
const head = document.head;

if (root) {
  init(root, head);
}

/**
 * -----------------------------------------------------------------------------
 * UTILS
 * -----------------------------------------------------------------------------
 */

function windowReader(window: Window): WindowReaderInstance {
  return {
    scrollX: () => window.scrollX,
    scrollY: () => window.scrollY,
    innerWidth: () => window.innerWidth,
    innerHeight: () => window.innerHeight,
  };
}

function documentProvider(document: Document) {
  return {
    createElement: document.createElement,
    appendChild: document.appendChild,
  };
}

function pipeReducers(...reducers: StateReducer[]) {
  return reducers.reduce((f, g) => (input) => g(f(input)));
}

// function clamp(min: number, max: number, value: number): number {
//   return Math.max(min, Math.min(max, value))
// }

function padRect(padding: number, rect: Rect): Rect {
  return {
    x: Math.max(0, rect.x - padding),
    y: Math.max(0, rect.y - padding),
    width: rect.width + padding,
    height: rect.height + padding,
  };
}

function throttle(fn: (...args: any[]) => any, delay: number) {
  let timerId: number | null = null;
  return (...args: any[]) => {
    if (timerId) return;
    timerId = window.setTimeout(() => {
      fn(...args);
      timerId = null;
    }, delay);
  };
}

function initializeStylesheet(
  cellDimensions: Point,
  cellCount: Point,
): HTMLStyleElement {
  const stylesheet = document.createElement("style");
  stylesheet.setAttribute("type", "text/css");
  stylesheet.innerText = `\
    .sheet {\
      display: relative;\
      width: ${cellCount.x * cellDimensions.x}px;\
      height: ${cellCount.y * cellDimensions.y}px;\
      font-family: "Helvetica Neue", Helvetica, Segoe, sans-serif;\
      font-size: 12px;\
      font-weight: bold;\
    }\
\
    .cell {\
      position: absolute;\
      border: 1px solid gray;\
      width: ${cellDimensions.x}px;\
      height: ${cellDimensions.y}px;\
      display: flex;\
      justify-content: center;\
      align-items: center;\
    }\
  `;
  return stylesheet;
}

function testAssert(assertion: boolean, success: string, failure: string) {
  if (assertion) console.debug(success);
  else console.debug(failure);
}
