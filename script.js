    // --- Global Variables & Constants ---
      const API_BASE_URL = "api.php"; // Our PHP backend file
      let categoryChart = null,
        spendingLineChart = null,
        categoryBarChart = null; // Global state
      let globalExpenses = [];
      let globalRecurring = [];
      let globalBudget = 0;

      const CATEGORIES = [
        "Food",
        "Transport",
        "Shopping",
        "Utilities",
        "Entertainment",
        "Health",
        "Other",
      ];
      const CHART_COLORS = [
        "#34568B",
        "#28A745",
        "#FFC107",
        "#6C757D",
        "#17A2B8",
        "#DC3545",
        "#FD7E14",
      ];

      $(document).ready(function () {
        // --- Initial Setup ---
        // 1. Initialize UI (static parts)
        initializeUI(); // 2. Add event listeners
        addEventListeners(); // 3. Load data from backend and render
        initializeApp();
      }); // --- Initializers ---
      async function initializeApp() {
        try {
          // Process recurring expenses first
          await fetch(`${API_BASE_URL}?action=process_recurring`, {
            method: "POST",
          }); // Fetch all dashboard data
          const response = await fetch(`${API_BASE_URL}?action=dashboard`);
          if (!response.ok) throw new Error("Failed to fetch dashboard data");
          const data = await response.json();
          globalExpenses = data.expenses;
          globalRecurring = data.recurring;
          globalBudget = data.monthlyBudget; // Now render the UI with the fetched data
          updateDashboard();
          displayExpenses();
        } catch (error) {
          console.error("Error initializing app:", error);
          alert(
            "Could not connect to the backend server. Make sure it is running and `api.php` is in the same folder."
          );
        }
      }

      function initializeUI() {
        // Populate category dropdowns
        const categoryOptions = CATEGORIES.map(
          (c) => `<option value="${c}">${c}</option>`
        ).join("");
        $("#expense-category").html(
          '<option value="" disabled selected>Select a category</option>' +
            categoryOptions
        );
        $("#filter-category").append(categoryOptions); // Setup theme
        const savedTheme = localStorage.getItem("theme") || "light"; // Theme is OK to keep in localStorage
        $("html").attr("data-bs-theme", savedTheme);
        $("#theme-switcher").prop("checked", savedTheme === "dark");
        updateThemeIcons(savedTheme); // Set default dates

        $("#expense-date").val(new Date().toISOString().split("T")[0]);
        const today = new Date();
        const firstDayOfMonth = new Date(
          today.getFullYear(),
          today.getMonth(),
          1
        )
          .toISOString()
          .split("T")[0];
        $("#report-start-date").val(firstDayOfMonth);
        $("#report-end-date").val(today.toISOString().split("T")[0]);
      }

      function addEventListeners() {
        // Navigation
        $("#nav-dashboard").on("click", () => switchView("dashboard"));
        $("#nav-reports").on("click", () => switchView("reports")); // Theme
        $("#theme-switcher").on("change", handleThemeChange); // Forms

        $("#expense-form").on("submit", handleExpenseFormSubmit);
        $("#budget-form").on("submit", handleBudgetFormSubmit); // Modals
        $("#addExpenseModal").on("show.bs.modal", resetExpenseForm);
        $("#expense-recurring-check").on("change", (e) =>
          $("#recurring-options").toggleClass("d-none", !e.target.checked)
        ); // Filters & Actions

        $("#filter-category, #filter-source, #filter-keyword").on(
          "change keyup",
          displayExpenses
        );
        $("#reset-filters-btn").on("click", resetFilters);
        $("#export-csv-btn").on("click", exportToCSV);
        $("#generate-report-btn").on("click", updateReports); // Event Delegation for dynamic content
        $("#expense-list-container").on(
          "click",
          ".edit-expense-btn",
          handleEditClick
        );
        $("#expense-list-container").on(
          "click",
          ".delete-expense-btn",
          handleDeleteClick
        );
        $("#recurring-list-container").on(
          "click",
          ".delete-recurring-btn",
          handleDeleteRecurringClick
        );
      } // --- View & Theme Management ---
      function switchView(view) {
        $(".nav-link").removeClass("active");
        if (view === "dashboard") {
          $("#dashboard-section").removeClass("d-none");
          $("#reports-section").addClass("d-none");
          $("#nav-dashboard").addClass("active");
        } else {
          $("#dashboard-section").addClass("d-none");
          $("#reports-section").removeClass("d-none");
          $("#nav-reports").addClass("active");
          updateReports();
        }
      }

      function handleThemeChange() {
        const isChecked = $(this).is(":checked");
        const theme = isChecked ? "dark" : "light";
        $("html").attr("data-bs-theme", theme);
        localStorage.setItem("theme", theme); // This is fine in localStorage
        updateThemeIcons(theme);
        updateAllCharts();
      }
      function updateThemeIcons(theme) {
        $("#theme-icon-moon").toggle(theme === "light");
        $("#theme-icon-sun").toggle(theme === "dark");
      } // --- API Helper Function ---
      async function apiRequest(action, method = "GET", body = null) {
        let url = `${API_BASE_URL}?action=${action}`;
        const options = {
          method,
          headers: {
            "Content-Type": "application/json",
          },
        };

        // For GET requests with an ID
        if (method === "GET" && body && body.id) {
          url += `&id=${body.id}`;
        }
        // For DELETE requests
        if (method === "DELETE" && body && body.id) {
          url += `&id=${body.id}`;
        }
        // For GET reports
        if (method === "GET" && body && body.start) {
          url += `&start=${body.start}&end=${body.end}`;
        }

        if (method === "POST" || method === "PUT") {
          options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(errText || "API request failed");
        }
        if (response.status === 204) {
          // No Content
          return null;
        }
        return response.json();
      } // --- Core Logic: Expenses ---

      async function handleExpenseFormSubmit(e) {
        e.preventDefault();
        const isRecurring = $("#expense-recurring-check").is(":checked");
        const expenseData = {
          description: $("#expense-description").val(),
          amount: parseFloat($("#expense-amount").val()),
          category: $("#expense-category").val(),
          source: $("#expense-source").val(),
          date: $("#expense-date").val(),
        };

        try {
          if (isRecurring) {
            const recurringData = {
              ...expenseData,
              frequency: $("#expense-frequency").val(),
              startDate: expenseData.date,
            };
            const newRecurring = await apiRequest(
              "add_recurring",
              "POST",
              recurringData
            );
            globalRecurring.push(newRecurring);
          } else {
            const expenseId = $("#expense-id").val();
            if (expenseId) {
              // Editing
              expenseData.id = parseInt(expenseId);
              const updatedExpense = await apiRequest(
                "update_expense",
                "POST",
                expenseData
              ); // Update in global state
              const index = globalExpenses.findIndex(
                (ex) => ex.id === updatedExpense.id
              );
              if (index !== -1) globalExpenses[index] = updatedExpense;
            } else {
              // Adding new
              const newExpense = await apiRequest(
                "add_expense",
                "POST",
                expenseData
              );
              globalExpenses.push(newExpense);
            }
          }
          $("#addExpenseModal").modal("hide");
          updateDashboard();
          displayExpenses();
        } catch (error) {
          console.error("Error saving expense:", error);
          alert("Failed to save expense: " + error.message);
        }
      }
      function handleEditClick() {
        const expenseId = $(this).data("id");
        const expense = globalExpenses.find((ex) => ex.id === expenseId);
        if (!expense) return;

        resetExpenseForm();
        $("#expense-modal-title").text("Edit Expense");
        $("#expense-submit-btn").text("Save Changes");
        $("#expense-id").val(expense.id);
        $("#expense-description").val(expense.description);
        $("#expense-amount").val(expense.amount);
        $("#expense-date").val(
          new Date(expense.date).toISOString().split("T")[0]
        ); // Fix date format
        $("#expense-category").val(expense.category);
        $("#expense-source").val(expense.source);
        $("#expense-recurring-check").parent().hide();
        $("#addExpenseModal").modal("show");
      }
      async function handleDeleteClick() {
        if (!confirm("Are you sure you want to delete this expense?")) return;
        const expenseId = $(this).data("id");
        try {
          await apiRequest(`delete_expense`, "DELETE", { id: expenseId });
          globalExpenses = globalExpenses.filter((ex) => ex.id !== expenseId);
          updateDashboard();
          displayExpenses();
        } catch (error) {
          console.error("Error deleting expense:", error);
          alert("Failed to delete expense: " + error.message);
        }
      } // --- Core Logic: Recurring Expenses ---

      function displayRecurringExpenses() {
        const container = $("#recurring-list-container");
        if (globalRecurring.length === 0) {
          container.html(
            '<p class="text-center text-muted">No recurring expenses found.</p>'
          );
          return;
        }
        const list = globalRecurring
          .map(
            (item) => `
            <div class="d-flex justify-content-between align-items-center p-2 border-bottom">
                <div>
                    <strong class="d-block">${item.description}</strong>
                    <small class="text-muted">₹${parseFloat(
              item.amount
            ).toFixed(2)} - ${item.category} - Every ${item.frequency.replace(
              "ly",
              ""
            )}</small>
                </div>
                <button class="btn btn-outline-danger btn-sm delete-recurring-btn" data-id="${
              item.id
            }"><i class="fas fa-trash"></i></button>
            </div>
        `
          )
          .join("");
        container.html(list);
      }
      async function handleDeleteRecurringClick() {
        if (!confirm("Are you sure? This will stop future automatic expenses."))
          return;
        const recurringId = $(this).data("id");
        try {
          await apiRequest(`delete_recurring`, "DELETE", { id: recurringId });
          globalRecurring = globalRecurring.filter((r) => r.id !== recurringId);
          displayRecurringExpenses();
        } catch (error) {
          console.error("Error deleting recurring expense:", error);
          alert("Failed to delete recurring expense: " + error.message);
        }
      } // --- UI Update & Display ---

      function displayExpenses() {
        const expenses = [...globalExpenses].sort(
          (a, b) => new Date(b.date) - new Date(a.date)
        );
        const container = $("#expense-list-container");
        const catFilter = $("#filter-category").val();
        const srcFilter = $("#filter-source").val();
        const keyFilter = $("#filter-keyword").val().toLowerCase();

        const filtered = expenses.filter(
          (ex) =>
            (catFilter === "all" || ex.category === catFilter) &&
            (srcFilter === "all" || ex.source === srcFilter) &&
            ex.description.toLowerCase().includes(keyFilter)
        );

        if (filtered.length === 0) {
          container.html(
            '<div class="empty-state" style="border:none; padding: 2rem;"><i class="fas fa-search-dollar"></i><p>No expenses found.</p></div>'
          );
          return;
        }

        const tableRows = filtered
          .map(
            (ex) => `
            <tr>
                <td>${new Date(ex.date).toLocaleDateString()}</td>
                <td>
                    <strong class="d-block">${ex.description}</strong>
                    <small class="text-muted">${ex.source}</small>
                </td>
                <td><span class="badge">${ex.category}</span></td>
                <td class="text-end fw-bold">₹${parseFloat(ex.amount).toFixed(
              2
            )}</td>
                <td class="text-center">
                    <button class="btn btn-outline-primary btn-sm edit-expense-btn" data-id="${
              ex.id
            }"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-outline-danger btn-sm delete-expense-btn" data-id="${
              ex.id
            }"><i class="fas fa-trash-alt"></i></button>
                </td>
            </tr>
        `
          )
          .join("");

        container.html(`
            <div class="table-responsive">
                <table class="table table-hover align-middle">
                    <thead><tr><th>Date</th><th>Description/Source</th><th>Category</th><th class="text-end">Amount</th><th class="text-center">Actions</th></tr></thead>
                    <tbody>${tableRows}</tbody>
                </table>
            </div>
        `);
      }

      function updateDashboard() {
        const budget = globalBudget;
        const now = new Date();
        const monthExpenses = globalExpenses.filter((ex) => {
          const exDate = new Date(ex.date);
          return (
            exDate.getMonth() === now.getMonth() &&
            exDate.getFullYear() === now.getFullYear()
          );
        }); // Summary
        const totalMonthExpense = monthExpenses.reduce(
          (sum, ex) => sum + parseFloat(ex.amount),
          0
        );
        $("#total-expenses").text(`₹${totalMonthExpense.toFixed(2)}`); // Budget
        const remaining = budget - totalMonthExpense;
        const percentage = budget > 0 ? (totalMonthExpense / budget) * 100 : 0;
        $("#budget-total").text(`/ ₹${budget.toFixed(2)}`);
        $("#budget-remaining")
          .text(`₹${remaining.toFixed(2)}`)
          .removeClass("text-danger");
        if (remaining < 0) $("#budget-remaining").addClass("text-danger");
        const progressBar = $("#budget-progress-bar");
        progressBar
          .css("width", `${Math.min(percentage, 100)}%`)
          .removeClass("bg-success bg-warning bg-danger");
        if (percentage > 100) progressBar.addClass("bg-danger");
        else if (percentage > 75) progressBar.addClass("bg-warning");
        else progressBar.addClass("bg-success"); // Pie Chart
        renderPieChart(monthExpenses);
        displayRecurringExpenses();
      }
      async function updateReports() {
        const start = $("#report-start-date").val();
        const end = $("#report-end-date").val();
        try {
          const filteredExpenses = await apiRequest(`get_reports`, "GET", {
            start,
            end,
          });
          renderSpendingLineChart(filteredExpenses);
          renderCategoryBarChart(filteredExpenses);
        } catch (error) {
          console.error("Error fetching report data:", error);
          alert("Failed to load report: " + error.message);
        }
      } // --- Charting ---
      function renderPieChart(data) {
        const ctx = document
          .getElementById("categoryPieChart")
          .getContext("2d");
        const categoryTotals = data.reduce((acc, ex) => {
          acc[ex.category] = (acc[ex.category] || 0) + parseFloat(ex.amount);
          return acc;
        }, {});
        const chartData = {
          labels: Object.keys(categoryTotals),
          datasets: [
            {
              data: Object.values(categoryTotals),
              backgroundColor: CHART_COLORS,
              borderColor:
                $("html").attr("data-bs-theme") === "dark"
                  ? "var(--theme-card-bg)"
                  : "var(--theme-card-bg)",
            },
          ],
        };

        if (categoryChart) categoryChart.destroy();
        categoryChart = new Chart(ctx, {
          type: "doughnut",
          data: chartData,
          options: getChartOptions(),
        });
      }

      function renderSpendingLineChart(data) {
        const ctx = document
          .getElementById("spending-line-chart")
          .getContext("2d");
        const spendingByDate = data.reduce((acc, ex) => {
          const date = ex.date.split("T")[0]; // Format date
          acc[date] = (acc[date] || 0) + parseFloat(ex.amount);
          return acc;
        }, {});
        const sortedDates = Object.keys(spendingByDate).sort(
          (a, b) => new Date(a) - new Date(b)
        );
        const chartData = {
          labels: sortedDates,
          datasets: [
            {
              label: "Daily Spending",
              data: sortedDates.map((date) => spendingByDate[date]),
              borderColor: "var(--theme-primary)",
              tension: 0.1,
              fill: false,
            },
          ],
        };

        if (spendingLineChart) spendingLineChart.destroy();
        spendingLineChart = new Chart(ctx, {
          type: "line",
          data: chartData,
          options: getChartOptions(true),
        });
      }
      function renderCategoryBarChart(data) {
        const ctx = document
          .getElementById("category-bar-chart")
          .getContext("2d");
        const categoryTotals = data.reduce((acc, ex) => {
          acc[ex.category] = (acc[ex.category] || 0) + parseFloat(ex.amount);
          return acc;
        }, {});

        const chartData = {
          labels: Object.keys(categoryTotals),
          datasets: [
            {
              label: "Total Spending by Category",
              data: Object.values(categoryTotals),
              backgroundColor: CHART_COLORS, // Use full palette for bars
            },
          ],
        };
        if (categoryBarChart) categoryBarChart.destroy();
        categoryBarChart = new Chart(ctx, {
          type: "bar",
          data: chartData,
          options: getChartOptions("bar"),
        });
      }

      function getChartOptions(type = "doughnut") {
        const isDark = $("html").attr("data-bs-theme") === "dark";
        const textColor = isDark
          ? "var(--theme-text)"
          : "var(--theme-text-muted)";
        const gridColor = isDark
          ? "var(--theme-border)"
          : "var(--theme-border)";

        const options = {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: {
                color: textColor,
                font: { family: "'Inter', sans-serif" },
              },
              position: "bottom",
            },
            tooltip: {
              bodyFont: { family: "'Inter', sans-serif" },
              titleFont: { family: "'Inter', sans-serif" },
            },
          },
          scales: {
            y: {
              ticks: {
                color: textColor,
                font: { family: "'Inter', sans-serif" },
              },
              grid: { color: gridColor },
            },
            x: {
              ticks: {
                color: textColor,
                font: { family: "'Inter', sans-serif" },
              },
              grid: { color: "transparent" },
            },
          },
        };
        if (type === "time") {
          options.scales.x.type = "time";
          options.scales.x.time = { unit: "day" };
          options.plugins.legend.display = true;
        } else if (type === "bar") {
          options.plugins.legend.display = false;
        } else {
          // doughnut
          options.plugins.legend.display = true;
        }

        return options;
      }
      function updateAllCharts() {
        const now = new Date();
        const monthExpenses = globalExpenses.filter((ex) => {
          const exDate = new Date(ex.date);
          return (
            exDate.getMonth() === now.getMonth() &&
            exDate.getFullYear() === now.getFullYear()
          );
        });
        renderPieChart(monthExpenses);

        if (!$("#reports-section").hasClass("d-none")) {
          updateReports();
        }
      } // --- Utility & Helper Functions ---
      function resetExpenseForm() {
        $("#expense-form")[0].reset();
        $("#expense-id").val("");
        $("#expense-modal-title").text("Add New Expense");
        $("#expense-submit-btn").text("Add Expense");
        $("#expense-date").val(new Date().toISOString().split("T")[0]);
        $("#expense-recurring-check").parent().show();
        $("#recurring-options").addClass("d-none");
      }

      async function handleBudgetFormSubmit(e) {
        e.preventDefault();
        const amount = parseFloat($("#budget-amount").val());
        try {
          await apiRequest("set_budget", "POST", { amount });
          globalBudget = amount;
          $("#budgetModal").modal("hide");
          updateDashboard();
        } catch (error) {
          console.error("Error saving budget:", error);
          alert("Failed to save budget: " + error.message);
        }
      }
      function resetFilters() {
        $("#filter-category").val("all");
        $("#filter-source").val("all");
        $("#filter-keyword").val("");
        displayExpenses();
      }

      function exportToCSV() {
        const expenses = globalExpenses; // Use the global state
        if (expenses.length === 0) {
          alert("No expenses to export.");
          return;
          C;
        }
        const headers = "ID,Date,Description,Amount,Category,Source\n";
        const rows = expenses
          .map(
            (ex) =>
              `${ex.id},${ex.date.split("T")[0]},"${ex.description.replace(
                /"/g,
                '""'
              )}",${ex.amount},${ex.category},${ex.source}`
          )
          .join("\n");
        const csvContent = headers + rows;
        const blob = new Blob([csvContent], {
          type: "text/csv;charset=utf-8;",
        });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute(
          "download",
          `expenses_${new Date().toISOString().split("T")[0]}.csv`
        );
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }