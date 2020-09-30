interface Point {
  x: number;
  y: number;
}

interface Rect extends Point {
  readonly width: number;
  readonly height: number;
}

interface Sheet {
  readonly colCount: number;
  readonly rowCount: number;
  readonly dimensions: Point; // in pixels
}

interface Cell {
  readonly col: number;
  readonly row: number;
  readonly position: Point;
  readonly text: string;
  node?: HTMLElement;
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
  readonly prevColOffset: number;
  readonly prevRowOffset: number;
  readonly cells: readonly Cell[];
  readonly cellDimensions: Point;
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
    colCount: 500,
    rowCount: 500,
    dimensions: { x: 0, y: 0 },
  },
  viewportRect: { x: 0, y: 0, width: 0, height: 0 },
  prevColOffset: 0,
  prevRowOffset: 0,
  cells: [],
  cellDimensions: { x: 120, y: 40 },
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
        x: state.sheet.colCount * state.cellDimensions.x,
        y: state.sheet.rowCount * state.cellDimensions.y,
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

const getCellText = (col: number, row: number) => `${col}:${row}`;

function cellConstructor(dimensions: Point, col: number, row: number): Cell {
  return {
    col,
    row,
    text: getCellText(col, row),
    position: { x: col * dimensions.x, y: row * dimensions.y },
    dirty: true,
  };
}

const getScrollData = (state: State) => {
  const {
    viewportRect: { x, y, width, height },
    prevColOffset,
    prevRowOffset,
    cellDimensions: cell,
  } = state;
  const colOffset = x === 0 ? 0 : Math.floor(x / cell.x);
  const colMax = colOffset + Math.ceil(width / cell.x);
  const colSpan = colMax - colOffset;
  const colDiff = colOffset - prevColOffset;
  const rowOffset = y === 0 ? 0 : Math.floor(y / cell.y);
  const rowMax = rowOffset + Math.ceil(height / cell.y);
  const rowSpan = rowMax - rowOffset;
  const rowDiff = rowOffset - prevRowOffset;
  return {
    colOffset,
    colMax,
    colSpan,
    colDiff,
    rowOffset,
    rowMax,
    rowSpan,
    rowDiff,
  };
};

(function testGetScrollData() {
  const cellX = 120, cellY = 40, colCount = 10, rowCount = 20;
  const positiveScroll: State = {
    // slightly clipping 2nd and 9th cells; should span 7 cells.
    viewportRect: { x: cellX + 10, y: cellY + 10, width: cellX * 8 - 10, height: cellY * 8 - 10 },
    prevColOffset: 0,
    prevRowOffset: 0,
    cells: [],
    sheet: { colCount, rowCount, dimensions: { x: 1200, y: 1200 }},
    cellDimensions: { x: 120, y: 40 },
    window: windowReader(window)
  }
  let result = getScrollData(positiveScroll);
  console.group('testGetScrollData positive scroll');
  console.assert(result.colOffset === 1, `colOffset: expected 1, got ${result.colOffset}`);
  console.assert(result.colMax === 8, `colMax: expected 8, got ${result.colMax}`);
  console.assert(result.colSpan === 7, `colSpan: expected 7, got ${result.colSpan}`);
  console.assert(result.colDiff === 1, `colDiff: expected 1, got ${result.colDiff}`);
  console.assert(result.rowOffset === 1, `rowOffset: expected 1, got ${result.rowOffset}`);
  console.assert(result.rowMax === 8, `rowMax: expected 8, got ${result.rowMax}`);
  console.assert(result.rowSpan === 7, `rowSpan: expected 7, got ${result.rowSpan}`);
  console.assert(result.rowDiff === 1, `rowDiff: expected 1, got ${result.rowDiff}`);
  console.groupEnd();

  const negativeScroll = { ...positiveScroll, prevColOffset: 2, prevRowOffset: 2 }
  result = getScrollData(negativeScroll);
  console.group('testGetScrollData negative scroll');
  console.assert(result.colOffset === 1, `colOffset: expected 1, got ${result.colOffset}`);
  console.assert(result.colMax === 8, `colMax: expected 8, got ${result.colMax}`);
  console.assert(result.colSpan === 7, `colSpan: expected 7, got ${result.colSpan}`);
  console.assert(result.colDiff === -1, `colDiff: expected 1, got ${result.colDiff}`);
  console.assert(result.rowOffset === 1, `rowOffset: expected 1, got ${result.rowOffset}`);
  console.assert(result.rowMax === 8, `rowMax: expected 8, got ${result.rowMax}`);
  console.assert(result.rowSpan === 7, `rowSpan: expected 7, got ${result.rowSpan}`);
  console.assert(result.rowDiff === -1, `rowDiff: expected 1, got ${result.rowDiff}`);
  console.groupEnd();
})()

function repositionCell() {
}

const cellsReducer: StateReducer = ({ state, action }) => {
  switch (action.type) {
    case "init": {
      let cells: Cell[] = [];
      const { colOffset, colMax, rowOffset, rowMax } = getScrollData(state);
      for (let row = rowOffset; row <= rowMax; row++) {
        for (let col = colOffset; col <= colMax; col++) {
          cells.push(cellConstructor(state.cellDimensions, col, row));
        }
      }
      return {
        action,
        state: {
          ...state,
          prevColOffset: colOffset,
          prevRowOffset: rowOffset,
          cells,
        },
      };
    }
    /*
winx 6.6 = 79.2px
max 10.7 = 128.4px
diff 4.1
offset
    */

    case "scroll": {
      const {
        colOffset,
        colMax,
        colSpan,
        colDiff,
        rowOffset,
        rowMax,
        rowSpan,
        rowDiff,
      } = getScrollData(state);
      const cells = state.cells.map((cell) => {
        let col = cell.col,
          row = cell.row,
          x = cell.position.x,
          y = cell.position.y,
          dirty = false;
        if (cell.col < colOffset || cell.col > colMax) {
          col = colDiff < 0 ? col - colSpan + colDiff : col + colSpan + colDiff;
          x = col * state.cellDimensions.x;
          dirty = true;
        }
        if (cell.row < rowOffset || cell.row > rowMax) {
          row = rowDiff < 0 ? row - rowSpan + rowDiff : row + rowSpan + rowDiff;
          y = row * state.cellDimensions.y;
          dirty = true;
        }
        if (dirty) {
          return {
            col,
            row,
            position: { x, y },
            text: getCellText(col, row),
            node: cell.node,
            dirty,
          };
        } else {
          return cell;
        }
      });

      return {
        action,
        state: {
          ...state,
          prevColOffset: colOffset,
          prevRowOffset: rowOffset,
          cells,
        },
      };
    }
    default:
      return { state, action };
  }
};

const reducer: StateReducer = pipeReducers(
  sheetReducer, // viewport measurements must be done first to prevent thrashing
  viewportRectReducer,
  cellsReducer,
);

function renderUnsafe(state: State): void {
  const { cells } = state;
  const len = cells.length;
  const batchSize = 50000;
  let idx = 0;
  // const renderCell = () => {
  //   const end = idx + batchSize <= len ? idx + batchSize : len;
  //   const slice = cells.slice(idx, end);
  //   for (let cell of slice) {
  //     if (cell.dirty) {
  //       const {
  //         position: { x, y },
  //       } = cell;
  //       cell.node!.style.transform = `translate(${x}px, ${y}px)`;
  //       cell.node!.innerText = cell.text;
  //       cell.dirty = false;
  //     }
  //   }
  //   idx = end;
  //   if (idx < len) requestAnimationFrame(renderCell);
  // };

  // requestAnimationFrame(renderCell);
  cells.forEach(cell => {
      if (cell.dirty) {
        const {
          position: { x, y },
        } = cell;
        cell.node!.style.transform = `translate(${x}px, ${y}px)`;
        cell.node!.innerText = cell.text;
        cell.dirty = false;
      }
  })
}

function init(root: HTMLElement, head: HTMLElement): void {
  let { state } = reducer({
    state: defaultState,
    action: { type: "init" },
  });
  const stylesheet = initializeStylesheet(state.cellDimensions, {
    x: state.sheet.colCount,
    y: state.sheet.rowCount,
  });
  head.appendChild(stylesheet);
  const sheetNode = document.createElement("div");
  sheetNode.className = "sheet";
  for (let cell of state.cells) {
    cell.node = document.createElement("span");
    cell.node.className = "cell";
    sheetNode.appendChild(cell.node);
  }
  root.appendChild(sheetNode);
  const scroll = () => {
    const { state: nextState } = reducer({ state, action: { type: "scroll" } });
    renderUnsafe(nextState);
    state = nextState;
  };
  // const onScroll = throttle(scroll, 32)
  // const onScroll = () => window.requestAnimationFrame(scroll);
  document.addEventListener("scroll", scroll, { passive: true });
  renderUnsafe(state);
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

function padRect(padding: number, rect: Rect, max: Point): Rect {
  return {
    x: Math.max(0, rect.x - padding),
    y: Math.max(0, rect.y - padding),
    width: Math.min(max.x, rect.width + padding),
    height: Math.min(max.y, rect.height + padding),
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
