# PlotStatLab: everyday editing

## Make part of a title italic

1. Click the title in the figure, or choose **Chart title**, **X axis title** or **Y axis title** in the visible **Text & axes** toolbar.
2. In the text editor that opens, select the letters or words you want to change.
3. Click **Italic**. Use **Bold** in the same way.

The figure updates while you edit. To format an entire title, click inside its text editor, select all of that title's text, then choose the formatting button.

## Put an axis title on two lines

Click the title, or choose it from **Text & axes**, place the cursor where the new line should start, and press **Enter**. For example:

```text
Treatment duration
(days)
```

The line break stays in the saved figure and exported SVG/PNG. Clicking a point opens that point's controls; clicking a title opens the text controls.

## Move the Y-axis title closer or farther away

Choose **Y axis title** in **Text & axes**, or click that title in the figure. Under **Distance from Y axis · px**, use **Move closer** or **Move farther**. You can also drag the slider or enter an exact distance. **Reset** restores the default spacing. The figure adjusts its margin to keep the title inside the exported artwork.

## Delete a dataset

Open **Data** for that dataset and choose **Delete dataset**, or use **Delete dataset** on its card in **Overview**. The **Delete dataset?** review shows the measurements, figures and saved results that belong to that dataset. Choose **Cancel** to keep them or **Delete dataset** to remove them together.

Use **Undo** to put the dataset and its related work back. Other datasets stay in the workspace. Deleting the final dataset leaves a blank table ready for new measurements. **Save workspace** keeps a portable `.psl` copy of your current work.

## Clear several values together

In **Data**, drag across numeric cells, or click the first cell and **Shift-click** the last cell of the range. The selected cells are highlighted and the selection bar shows how many cells are selected.

- Choose **Clear selected values**, or press **Delete/Backspace** while the range is selected. Cleared measurements become blank cells.
- Choose **Exclude selected** to keep the original values visible while omitting them from future calculations.
- Choose **Restore selected** to include previously excluded values again.
- Choose **Select all values**, or use the row/column selection buttons, for a larger selection.

**Undo** restores a complete clear operation in one step. To edit the characters in one cell, double-click it or press **F2**; Delete/Backspace then edits that cell's text. Press Enter to finish the edit.

For an **Advanced table**, select the checkboxes beside the observations, then choose **Remove selected rows** to remove those complete observations together. The heading checkbox selects all rows, including other pages. **Exclude selected** and **Restore selected** are also available here.

Blank cells are missing measurements. A value of zero remains a real measurement. After changing measurements or exclusions, review the saved results marked out of date and run a new analysis when needed.
