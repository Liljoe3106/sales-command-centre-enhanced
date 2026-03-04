/*
 * Sales Command Centre Script
 *
 * Handles reading spreadsheet files via SheetJS, displaying the contents
 * in a scrollable, editable table, and exporting the updated workbook.
 * Features:
 *   • Sidebar navigation for multiple sheets
 *   • Dark UI with green accent highlights
 *   • Timeline columns rendered as drop‑down lists
 *   • Currency columns formatted as GBP
 *   • Totals row displayed at the bottom of each sheet (not included in export)
 *   • Accent keywords highlighted (Move Deal, Grow Account, Create Opportunity,
 *     Priority Deals, Value, Next Step)
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM elements
  const fileInput = document.getElementById('file-input');
  const downloadBtn = document.getElementById('download-btn');
  const statusEl = document.getElementById('status');
  const tableContainer = document.getElementById('table-container');
  const sheetListEl = document.getElementById('sheet-list');
  const sheetSidebarEl = document.getElementById('sheet-sidebar');

  // Workbook state
  let workbook = null;
  let currentSheetName = null;
  // Keep track of currency column indexes for the current sheet
  let currentCurrencyColumns = [];
  // Index of timeline column if present
  let currentTimelineColumn = -1;
  // Keywords that will trigger accent styling
  const accentKeywords = [
    'move deal', 'grow account', 'create opportunity',
    'priority deals', 'value', 'next step'
  ];
  // Options for timeline drop‑downs; order defines sort order
  const timelineOptions = ['This Quarter', 'Next Quarter', 'This Year', 'Not Known'];

  /**
   * Determine if a header string likely represents a currency column.
   * Checks common currency symbols and keywords.
   * @param {string} header Cell header text
   * @returns {boolean} True if column appears to be currency
   */
  function isCurrencyHeader(header) {
    const lc = header.toLowerCase();
    return lc.includes('£') || lc.includes('$') || lc.includes('€') || lc.includes('revenue') || lc.includes('budget') || lc.includes('spend');
  }

  /**
   * Determine if a header string likely represents a timeline column.
   * Looks for words like 'timeline' or 'forecast'.
   * @param {string} header Cell header text
   * @returns {boolean} True if column appears to be a timeline
   */
  function isTimelineHeader(header) {
    const lc = header.toLowerCase();
    return lc.includes('timeline') || lc.includes('stage') || lc.includes('quarter');
  }

  /**
   * Populate the sidebar sheet list based on the workbook's sheet names.
   */
  function populateSheetList() {
    sheetListEl.innerHTML = '';
    workbook.SheetNames.forEach((name, index) => {
      const li = document.createElement('li');
      li.textContent = name;
      li.dataset.sheetName = name;
      li.addEventListener('click', () => {
        // Save current edits before switching
        updateCurrentSheet();
        // Display selected sheet
        displaySheet(name);
        // Highlight active
        document.querySelectorAll('#sheet-list li').forEach(item => item.classList.remove('active'));
        li.classList.add('active');
      });
      // Activate the first sheet by default
      if (index === 0) {
        li.classList.add('active');
      }
      sheetListEl.appendChild(li);
    });
    sheetSidebarEl.hidden = false;
  }

  /**
   * Compute totals for numeric columns.
   * Only currency columns are summed; other columns return an empty string.
   * @param {Array[]} data Two‑dimensional array of sheet data
   * @returns {Array} A totals row matching the number of columns
   */
  function computeTotals(data) {
    const totals = new Array(data[0].length).fill('');
    currentCurrencyColumns.forEach(colIndex => {
      let sum = 0;
      for (let i = 1; i < data.length; i++) {
        const raw = data[i][colIndex];
        const numeric = parseFloat(String(raw).replace(/[^0-9.-]+/g, ''));
        if (!isNaN(numeric)) sum += numeric;
      }
      totals[colIndex] = sum;
    });
    return totals;
  }

  /**
   * Render a table based on a two‑dimensional array of cell values.
   * @param {Array[]} data The sheet data to render
   */
  function renderTable(data) {
    if (!data || !data.length) {
      tableContainer.innerHTML = '<p>No data found in this sheet.</p>';
      return;
    }
    // Reset current column tracking
    currentCurrencyColumns = [];
    currentTimelineColumn = -1;
    // Determine column types from the header row (assumed to be first row)
    const headers = data[0];
    headers.forEach((header, idx) => {
      const headerText = header === undefined ? '' : String(header);
      if (isCurrencyHeader(headerText)) {
        currentCurrencyColumns.push(idx);
      }
      if (currentTimelineColumn < 0 && isTimelineHeader(headerText)) {
        currentTimelineColumn = idx;
      }
    });

    // Compute totals row (for display only)
    const totals = computeTotals(data);

    // Create table elements
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');

    // Build header row
    const headerRow = document.createElement('tr');
    headers.forEach((cell, colIndex) => {
      const th = document.createElement('th');
      th.textContent = cell === undefined ? '' : cell;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    // Build body rows
    for (let rowIndex = 1; rowIndex < data.length; rowIndex++) {
      const row = document.createElement('tr');
      const rowData = data[rowIndex];
      headers.forEach((_, colIndex) => {
        const td = document.createElement('td');
        const cell = rowData[colIndex];
        // Timeline column: drop‑down select
        if (colIndex === currentTimelineColumn) {
          const select = document.createElement('select');
          timelineOptions.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt;
            option.textContent = opt;
            select.appendChild(option);
          });
          // Set selected value to current cell value if present
          if (cell !== undefined && cell !== null) {
            const currentVal = String(cell).trim();
            if (timelineOptions.includes(currentVal)) {
              select.value = currentVal;
            }
          }
          // On change, update sheet data and recompute totals
          select.addEventListener('change', () => {
            updateCurrentSheet();
            // Recompute totals and re‑render table (keeps TOT row updated)
            displaySheet(currentSheetName);
          });
          td.appendChild(select);
        } else {
          // Other columns: editable cell
          td.contentEditable = true;
          // If currency column, format value
          if (currentCurrencyColumns.includes(colIndex)) {
            const raw = cell === undefined ? '' : cell;
            const numeric = parseFloat(String(raw).replace(/[^0-9.-]+/g, ''));
            if (!isNaN(numeric)) {
              td.textContent = numeric.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' });
              td.classList.add('currency');
            } else {
              td.textContent = raw;
            }
          } else {
            td.textContent = cell === undefined ? '' : cell;
          }
          // Highlight accent keywords
          const cellLower = (cell === undefined ? '' : String(cell)).toLowerCase().trim();
          if (accentKeywords.some(keyword => cellLower.includes(keyword))) {
            td.classList.add('accent-cell');
          }
          td.addEventListener('input', () => {
            updateCurrentSheet();
            // Update totals row when any cell is edited
            displaySheet(currentSheetName);
          });
        }
        row.appendChild(td);
      });
      tbody.appendChild(row);
    }

    // Build totals row for display
    const totalsRow = document.createElement('tr');
    totalsRow.classList.add('totals-row');
    headers.forEach((_, colIndex) => {
      const td = document.createElement('td');
      const totalVal = totals[colIndex];
      if (colIndex === 0) {
        td.textContent = 'Totals';
      } else if (currentCurrencyColumns.includes(colIndex) && totalVal !== '') {
        td.textContent = totalVal.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' });
        td.classList.add('currency');
      } else {
        td.textContent = '';
      }
      totalsRow.appendChild(td);
    });
    tbody.appendChild(totalsRow);

    table.appendChild(thead);
    table.appendChild(tbody);
    tableContainer.innerHTML = '';
    tableContainer.appendChild(table);
  }

  /**
   * Extract data from the current displayed table back into an array of arrays.
   * Skips the totals row and converts currency values back to numbers.
   * @returns {Array[]} New sheet data (including header)
   */
  function extractTableData() {
    const table = tableContainer.querySelector('table');
    if (!table) return [];
    const rows = Array.from(table.querySelectorAll('tr'));
    const data = [];
    rows.forEach((row) => {
      // Skip totals row
      if (row.classList.contains('totals-row')) return;
      const cells = Array.from(row.querySelectorAll('th,td'));
      const rowData = cells.map((cell, colIndex) => {
        const select = cell.querySelector('select');
        let val;
        if (select) {
          val = select.value;
        } else {
          val = cell.textContent;
        }
        // Convert currency strings back to numbers (except header row)
        if (data.length > 0 && currentCurrencyColumns.includes(colIndex)) {
          const numeric = parseFloat(String(val).replace(/[^0-9.-]+/g, ''));
          return isNaN(numeric) ? val : numeric;
        }
        return val;
      });
      data.push(rowData);
    });
    return data;
  }

  /**
   * Display a sheet by name. Converts worksheet to array and renders it.
   * @param {string} sheetName Name of the sheet to display
   */
  function displaySheet(sheetName) {
    if (!workbook) return;
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) return;
    currentSheetName = sheetName;
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    renderTable(data);
    statusEl.textContent = `Viewing sheet: ${sheetName}`;
  }

  /**
   * Update the workbook with the current table values for the active sheet.
   */
  function updateCurrentSheet() {
    if (!workbook || !currentSheetName) return;
    const data = extractTableData();
    const newSheet = XLSX.utils.aoa_to_sheet(data);
    workbook.Sheets[currentSheetName] = newSheet;
  }

  // Handle file selection
  fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const array = new Uint8Array(e.target.result);
      workbook = XLSX.read(array, { type: 'array' });
      statusEl.textContent = `Loaded ${file.name}`;
      // Populate sheet sidebar and display first sheet
      populateSheetList();
      downloadBtn.hidden = false;
      displaySheet(workbook.SheetNames[0]);
    };
    reader.onerror = (err) => {
      console.error(err);
      statusEl.textContent = 'Error reading file';
    };
    reader.readAsArrayBuffer(file);
  });

  // Handle download updated workbook
  downloadBtn.addEventListener('click', () => {
    if (!workbook) return;
    // Save current sheet before export
    updateCurrentSheet();
    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'updated_workbook.xlsx';
    a.click();
    URL.revokeObjectURL(url);
    statusEl.textContent = 'Updated workbook downloaded';
  });
});