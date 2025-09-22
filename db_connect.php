<?php
// --- !! IMPORTANT !! ---
// Update these details if your MySQL setup is different
$servername = "localhost";
$username = "root";       // Default XAMPP username
$password = "";           // Default XAMPP password
$dbname = "expense_tracker";

// Create connection
$conn = new mysqli($servername, $username, $password, $dbname);

// Check connection
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

// Set headers to return JSON
header('Content-Type: application/json');
?>