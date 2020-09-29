var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var defaultState = {
    sheet: {
        columnCount: 500,
        rowCount: 500,
        dimensions: { x: 0, y: 0 }
    },
    viewportRect: { x: 0, y: 0, width: 0, height: 0 },
    visibleColumns: [],
    visibleRows: [],
    cells: [],
    defaultCellDimensions: { x: 120, y: 40 },
    scrollBuffer: 100,
    window: windowReader(window)
};
// function reducer(state: State, scrollPosition: Point): State {
// use the padded bounding box to get col/row anticollisions
// for each invisible col/row iterate through the cells and move them to the opposite side unless it is at min/max (update top/left values)
// send the state to the renderer where it will read the cell positions and rewrite the top/left styles
// }
/**
 * -----------------------------------------------------------------------------
 * SHEET REDUCER
 * -----------------------------------------------------------------------------
 */
var sheetReducer = function (_a) {
    var state = _a.state, action = _a.action;
    switch (action.type) {
        case "init": {
            var dimensions = {
                x: state.sheet.columnCount * state.defaultCellDimensions.x,
                y: state.sheet.rowCount * state.defaultCellDimensions.y
            };
            return {
                action: action,
                state: __assign(__assign({}, state), { sheet: __assign(__assign({}, state.sheet), { dimensions: dimensions }) })
            };
        }
        default:
            return { state: state, action: action };
    }
};
/**
 * -----------------------------------------------------------------------------
 * VIEWPORT RECT REDUCER
 * -----------------------------------------------------------------------------
 */
var viewportRectReducer = function (_a) {
    var state = _a.state, action = _a.action;
    switch (action.type) {
        case "init":
            return {
                action: action,
                state: __assign(__assign({}, state), { viewportRect: {
                        x: state.window.scrollX(),
                        y: state.window.scrollY(),
                        width: state.window.innerWidth(),
                        height: state.window.innerHeight()
                    } })
            };
        case "scroll":
            return {
                action: action,
                state: __assign(__assign({}, state), { viewportRect: __assign(__assign({}, state.viewportRect), { x: state.window.scrollX(), y: state.window.scrollY() }) })
            };
        default:
            return { state: state, action: action };
    }
};
/**
 * -----------------------------------------------------------------------------
 * CELLS REDUCER
 * -----------------------------------------------------------------------------
 */
function cellConstructor(dimensions, column, row) {
    return {
        column: column,
        row: row,
        text: column + ":" + row,
        position: { x: column * dimensions.x, y: row * dimensions.y },
        node: null,
        dirty: true
    };
}
function getVisibleColumns(viewportRect, cellDimensions) {
    var columnsFromOrigin = Math.floor(viewportRect.x / cellDimensions.x);
    var visibleColumnCount = Math.ceil(viewportRect.width / cellDimensions.x);
    return Array.from({ length: visibleColumnCount }).map(function (_, i) { return columnsFromOrigin + i; });
}
function getVisibleRows(viewportRect, cellDimensions) {
    var rowsFromOrigin = Math.floor(viewportRect.y / cellDimensions.y);
    var visibleRowCount = Math.ceil(viewportRect.height / cellDimensions.y);
    return Array.from({ length: visibleRowCount }).map(function (_, i) { return rowsFromOrigin + i; });
}
function diffGroups(prev, next) {
    // Use a set for faster lookup
    var prevSet = new Set(prev);
    var nextSet = new Set(next);
    var added = next.filter(function (x) { return !prevSet.has(x); });
    var removed = prev.filter(function (x) { return !nextSet.has(x); });
    return { added: added, removed: removed };
}
var cellsReducer = function (_a) {
    var state = _a.state, action = _a.action;
    var viewportRect = state.viewportRect, scrollBuffer = state.scrollBuffer, cellDimensions = state.defaultCellDimensions;
    // const paddedViewport = padRect(scrollBuffer, viewportRect, {
    //   x: state.sheet.dimensions.x,
    //   y: state.sheet.dimensions.y,
    // });
    var paddedViewport = viewportRect;
    switch (action.type) {
        case "init": {
            var cells = [];
            var visibleColumns = getVisibleColumns(paddedViewport, cellDimensions);
            var visibleRows = getVisibleRows(paddedViewport, cellDimensions);
            var rowStart = visibleRows[0];
            var rowEnd = visibleRows[visibleRows.length - 1];
            var columnStart = visibleColumns[0];
            var columnEnd = visibleColumns[visibleColumns.length - 1];
            for (var row = rowStart; row <= rowEnd; row++) {
                for (var column = columnStart; column <= columnEnd; column++) {
                    var cell = cellConstructor(cellDimensions, column, row);
                    cells.push(cell);
                }
            }
            return {
                action: action,
                state: __assign(__assign({}, state), { visibleColumns: visibleColumns,
                    visibleRows: visibleRows,
                    cells: cells })
            };
        }
        case "scroll": {
            var visible = {
                columns: getVisibleColumns(paddedViewport, cellDimensions),
                rows: getVisibleRows(paddedViewport, cellDimensions)
            };
            var columnsDiff_1 = diffGroups(state.visibleColumns.concat(), visible.columns);
            var rowsDiff_1 = diffGroups(state.visibleRows.concat(), visible.rows);
            // here we are assuming that the removed list has the same length as the
            // added list. We have to loop over every cell twice to move columns and
            // rows separately.
            var cells = state.cells.map(function (cell) {
                var colIdx = columnsDiff_1.removed.indexOf(cell.column);
                var rowIdx = rowsDiff_1.removed.indexOf(cell.row);
                if (colIdx < 0 && rowIdx < 0)
                    return cell;
                var column = cell.column;
                var row = cell.row;
                var position = __assign({}, cell.position);
                var dirty = false;
                if (colIdx >= 0) {
                    column = columnsDiff_1.added[colIdx];
                    position.x = column * cellDimensions.x;
                    dirty = true;
                }
                if (rowIdx >= 0) {
                    row = rowsDiff_1.added[rowIdx];
                    position.y = row * cellDimensions.y;
                    dirty = true;
                }
                if (dirty === true) {
                    return __assign(__assign({}, cell), { column: column,
                        row: row,
                        position: position, text: column + ":" + row, dirty: dirty });
                }
                return cell;
            });
            return {
                action: action,
                state: __assign(__assign({}, state), { visibleColumns: visible.columns, visibleRows: visible.rows, cells: cells })
            };
        }
        default:
            return { state: state, action: action };
    }
};
var reducer = pipeReducers(sheetReducer, viewportRectReducer, cellsReducer);
function renderUnsafe(state) {
    var cmp = function () {
        var fns = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            fns[_i] = arguments[_i];
        }
        return fns.reduce(function (f, g) { return function () { return g(f()); }; });
    };
    var rafs = [];
    state.cells.forEach(function (cell) {
        rafs.push(function () {
            if (!cell.node)
                return;
            if (cell.dirty) {
                cell.node.style.transform = "translate(" + cell.position.x + "px, " + cell.position.y + "px)";
                // cell.node.style.left = `${cell.position.x}px`;
                cell.node.innerText = cell.text;
                cell.dirty = false;
            }
        });
    });
    cmp.apply(void 0, rafs)();
}
function init(root, head) {
    var state = reducer({
        state: defaultState,
        action: { type: "init" }
    }).state;
    var stylesheet = initializeStylesheet(state.defaultCellDimensions, {
        x: state.sheet.columnCount,
        y: state.sheet.rowCount
    });
    head.appendChild(stylesheet);
    var fragment = document.createDocumentFragment();
    var sheetNode = document.createElement("div");
    sheetNode.className = "sheet";
    var cellNodes = state.cells.map(function (cell) {
        var cellNode = document.createElement("span");
        cellNode.className = "cell";
        cellNode.style.transform = "translate(" + cell.position.x + "px, " + cell.position.y + "px)";
        cellNode.innerText = cell.text;
        cell.dirty = false; // Bad, but I can't think of a better way.
        cell.node = cellNode;
        return cellNode;
    });
    fragment.appendChild(sheetNode);
    cellNodes.forEach(function (node) {
        sheetNode.appendChild(node);
    });
    root.appendChild(fragment);
    var scroll = function () {
        var nextState = reducer({ state: state, action: { type: "scroll" } }).state;
        renderUnsafe(nextState);
        state = nextState;
    };
    // const onScroll = throttle(scroll, 16)
    // const onScroll = () => window.requestAnimationFrame(scroll);
    document.addEventListener("scroll", scroll, { passive: true });
}
var root = document.getElementById("root");
var head = document.head;
if (root) {
    init(root, head);
}
/**
 * -----------------------------------------------------------------------------
 * UTILS
 * -----------------------------------------------------------------------------
 */
function windowReader(window) {
    return {
        scrollX: function () { return window.scrollX; },
        scrollY: function () { return window.scrollY; },
        innerWidth: function () { return window.innerWidth; },
        innerHeight: function () { return window.innerHeight; }
    };
}
function documentProvider(document) {
    return {
        createElement: document.createElement,
        appendChild: document.appendChild
    };
}
function pipeReducers() {
    var reducers = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        reducers[_i] = arguments[_i];
    }
    return reducers.reduce(function (f, g) { return function (input) { return g(f(input)); }; });
}
// function clamp(min: number, max: number, value: number): number {
//   return Math.max(min, Math.min(max, value))
// }
function padRect(padding, rect, max) {
    return {
        x: Math.max(0, rect.x - padding),
        y: Math.max(0, rect.y - padding),
        width: Math.min(max.x, rect.width + padding),
        height: Math.min(max.y, rect.height + padding)
    };
}
function throttle(fn, delay) {
    var timerId = null;
    return function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        if (timerId)
            return;
        timerId = window.setTimeout(function () {
            fn.apply(void 0, args);
            timerId = null;
        }, delay);
    };
}
function initializeStylesheet(cellDimensions, cellCount) {
    var stylesheet = document.createElement("style");
    stylesheet.setAttribute("type", "text/css");
    stylesheet.innerText = "    .sheet {      display: relative;      width: " + cellCount.x * cellDimensions.x + "px;      height: " + cellCount.y * cellDimensions.y + "px;      font-family: \"Helvetica Neue\", Helvetica, Segoe, sans-serif;      font-size: 12px;      font-weight: bold;    }    .cell {      position: absolute;      border: 1px solid gray;      width: " + cellDimensions.x + "px;      height: " + cellDimensions.y + "px;      display: flex;      justify-content: center;      align-items: center;    }  ";
    return stylesheet;
}
function testAssert(assertion, success, failure) {
    if (assertion)
        console.debug(success);
    else
        console.debug(failure);
}
