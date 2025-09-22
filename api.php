<?php
include 'db_connect.php';

// Get the requested action
$action = $_GET['action'] ?? '';

// Get the request body (for POST, PUT)
$data = json_decode(file_get_contents('php://input'), true);

switch ($action) {
    case 'dashboard':
        getDashboardData($conn);
        break;
    case 'add_expense':
        addExpense($conn, $data);
        break;
    case 'update_expense':
        updateExpense($conn, $data);
        break;
    case 'delete_expense':
        deleteExpense($conn, $_GET['id']);
        break;
    case 'add_recurring':
        addRecurring($conn, $data);
        break;
    case 'delete_recurring':
        deleteRecurring($conn, $_GET['id']);
        break;
    case 'set_budget':
        setBudget($conn, $data);
        break;
    case 'get_reports':
        getReports($conn, $_GET['start'], $_GET['end']);
        break;
    case 'process_recurring':
        processRecurring($conn);
        break;
    default:
        echo json_encode(['error' => 'No valid action specified']);
}

// --- FUNCTIONS ---

function getDashboardData($conn) {
    $expenses = $conn->query("SELECT * FROM expenses ORDER BY date DESC")->fetch_all(MYSQLI_ASSOC);
    $recurring = $conn->query("SELECT * FROM recurring_expenses")->fetch_all(MYSQLI_ASSOC);
    $budgetResult = $conn->query("SELECT setting_value FROM settings WHERE setting_key = 'monthlyBudget'");
    $budget = $budgetResult->fetch_assoc()['setting_value'] ?? '0';

    echo json_encode([
        'expenses' => $expenses,
        'recurring' => $recurring,
        'monthlyBudget' => (float)$budget
    ]);
}

function addExpense($conn, $data) {
    $stmt = $conn->prepare("INSERT INTO expenses (description, amount, category, source, date) VALUES (?, ?, ?, ?, ?)");
    $stmt->bind_param("sdsss", $data['description'], $data['amount'], $data['category'], $data['source'], $data['date']);
    $stmt->execute();
    $newId = $stmt->insert_id;
    echo json_encode(['id' => $newId] + $data);
}

function updateExpense($conn, $data) {
    $stmt = $conn->prepare("UPDATE expenses SET description = ?, amount = ?, category = ?, source = ?, date = ? WHERE id = ?");
    $stmt->bind_param("sdsssi", $data['description'], $data['amount'], $data['category'], $data['source'], $data['date'], $data['id']);
    $stmt->execute();
    echo json_encode($data);
}

function deleteExpense($conn, $id) {
    $stmt = $conn->prepare("DELETE FROM expenses WHERE id = ?");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    echo json_encode(['success' => true]);
}

function addRecurring($conn, $data) {
    $stmt = $conn->prepare("INSERT INTO recurring_expenses (description, amount, category, source, frequency, startDate) VALUES (?, ?, ?, ?, ?, ?)");
    $stmt->bind_param("sdssss", $data['description'], $data['amount'], $data['category'], $data['source'], $data['frequency'], $data['startDate']);
    $stmt->execute();
    $newId = $stmt->insert_id;
    echo json_encode(['id' => $newId] + $data);
}

function deleteRecurring($conn, $id) {
    $stmt = $conn->prepare("DELETE FROM recurring_expenses WHERE id = ?");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    echo json_encode(['success' => true]);
}

function setBudget($conn, $data) {
    $stmt = $conn->prepare("INSERT INTO settings (setting_key, setting_value) VALUES ('monthlyBudget', ?) ON DUPLICATE KEY UPDATE setting_value = ?");
    $stmt->bind_param("ss", $data['amount'], $data['amount']);
    $stmt->execute();
    echo json_encode(['monthlyBudget' => $data['amount']]);
}

function getReports($conn, $start, $end) {
    $stmt = $conn->prepare("SELECT * FROM expenses WHERE date >= ? AND date <= ? ORDER BY date ASC");
    $stmt->bind_param("ss", $start, $end);
    $stmt->execute();
    $result = $stmt->get_result();
    echo json_encode($result->fetch_all(MYSQLI_ASSOC));
}

function processRecurring($conn) {
    $recurring = $conn->query("SELECT * FROM recurring_expenses")->fetch_all(MYSQLI_ASSOC);
    $today = new DateTime();
    $newExpensesAdded = 0;

    foreach ($recurring as $item) {
        $lastAdded = new DateTime($item['lastAdded'] ?? $item['startDate']);
        $nextDueDate = new DateTime($item['lastAdded'] ?? $item['startDate']);
        
        $interval = '';
        if ($item['frequency'] == 'monthly') $interval = 'P1M';
        if ($item['frequency'] == 'weekly') $interval = 'P1W';
        if ($item['frequency'] == 'yearly') $interval = 'P1Y';
        if ($interval == '') continue;

        $nextDueDate->add(new DateInterval($interval));

        while ($nextDueDate <= $today) {
            $newDate = $nextDueDate->format('Y-m-d');
            
            // Add new expense
            $stmt = $conn->prepare("INSERT INTO expenses (description, amount, category, source, date) VALUES (?, ?, ?, ?, ?)");
            $stmt->bind_param("sdsss", $item['description'], $item['amount'], $item['category'], $item['source'], $newDate);
            $stmt->execute();
            $newExpensesAdded++;

            // Update recurring item's lastAdded date
            $updateStmt = $conn->prepare("UPDATE recurring_expenses SET lastAdded = ? WHERE id = ?");
            $updateStmt->bind_param("si", $newDate, $item['id']);
            $updateStmt->execute();
            
            // Advance to the next due date
            $nextDueDate->add(new DateInterval($interval));
        }
    }
    echo json_encode(['newExpensesAdded' => $newExpensesAdded]);
}

$conn->close();
?>