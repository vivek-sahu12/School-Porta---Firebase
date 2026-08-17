/**
 * Super Admin Centralized Data & State Store
 * Prepared for future Firestore / Firebase backend integration.
 */

export const superAdminState = {
  // 1. Statistics Overview
  metrics: {
    totalSchools: 12,
    activeSchools: 11,
    inactiveSchools: 1,
    totalUsers: 48,
    activeSessions: 14
  },

  // 2. Schools Collection
  schools: [
    {
      id: "SCH-1001",
      name: "St. Xavier's International Academy",
      shortCode: "SXIA",
      logo: "SX",
      status: "Active",
      usersCount: 8,
      assignedAdmin: "principal@stxaviers.edu",
      createdDate: "12 Jan 2025",
      address: "42 Richmond Road, North Campus",
      phone: "+91 98765 43210",
      lastActivity: "10 mins ago"
    },
    {
      id: "SCH-1002",
      name: "Delhi Public Global School",
      shortCode: "DPGS",
      logo: "DP",
      status: "Active",
      usersCount: 14,
      assignedAdmin: "admin@dpglobalschool.edu",
      createdDate: "05 Feb 2025",
      address: "Sector 14, Institutional Area",
      phone: "+91 98111 22334",
      lastActivity: "2 mins ago"
    },
    {
      id: "SCH-1003",
      name: "Greenwood Valley High School",
      shortCode: "GVHS",
      logo: "GV",
      status: "Active",
      usersCount: 6,
      assignedAdmin: "headmaster@greenwoodvalley.org",
      createdDate: "18 Mar 2025",
      address: "Hill View Enclave, South Zone",
      phone: "+91 97234 56789",
      lastActivity: "1 hour ago"
    },
    {
      id: "SCH-1004",
      name: "Modern English Academy",
      shortCode: "MEA",
      logo: "ME",
      status: "Active",
      usersCount: 5,
      assignedAdmin: "itadmin@modernacademy.ac.in",
      createdDate: "22 Apr 2025",
      address: "Plot 88, Central Avenue",
      phone: "+91 96543 21098",
      lastActivity: "5 hours ago"
    },
    {
      id: "SCH-1005",
      name: "Silver Oak Preparatory School",
      shortCode: "SOPS",
      logo: "SO",
      status: "Inactive",
      usersCount: 2,
      assignedAdmin: "director@silveroakprep.com",
      createdDate: "10 May 2025",
      address: "bypass Junction, West Ext.",
      phone: "+91 95432 10987",
      lastActivity: "3 days ago"
    },
    {
      id: "SCH-1006",
      name: "Horizon Scholars International",
      shortCode: "HSI",
      logo: "HS",
      status: "Active",
      usersCount: 13,
      assignedAdmin: "admin@horizonscholars.org",
      createdDate: "15 Jun 2025",
      address: "Knowledge Boulevard, Phase 2",
      phone: "+91 94321 09876",
      lastActivity: "Just now"
    }
  ],

  // 3. Users Collection
  users: [
    {
      id: "USR-001",
      name: "Super Administrator",
      email: "admin@schoolportal.com",
      schoolId: "ALL",
      schoolName: "Global Super Admin",
      role: "Super Admin",
      status: "Active",
      lastLogin: "Active Now"
    },
    {
      id: "USR-002",
      name: "Dr. Rajesh Sharma",
      email: "principal@stxaviers.edu",
      schoolId: "SCH-1001",
      schoolName: "St. Xavier's International Academy",
      role: "School Admin",
      status: "Active",
      lastLogin: "10 mins ago"
    },
    {
      id: "USR-003",
      name: "Anita Deshmukh",
      email: "anita.d@stxaviers.edu",
      schoolId: "SCH-1001",
      schoolName: "St. Xavier's International Academy",
      role: "Teacher / Operator",
      status: "Active",
      lastLogin: "2 hours ago"
    },
    {
      id: "USR-004",
      name: "Vikram Malhotra",
      email: "admin@dpglobalschool.edu",
      schoolId: "SCH-1002",
      schoolName: "Delhi Public Global School",
      role: "School Admin",
      status: "Active",
      lastLogin: "2 mins ago"
    },
    {
      id: "USR-005",
      name: "Suresh Rao",
      email: "suresh.r@dpglobalschool.edu",
      schoolId: "SCH-1002",
      schoolName: "Delhi Public Global School",
      role: "Teacher / Operator",
      status: "Active",
      lastLogin: "Yesterday, 4:15 PM"
    },
    {
      id: "USR-006",
      name: "Pooja Verma",
      email: "headmaster@greenwoodvalley.org",
      schoolId: "SCH-1003",
      schoolName: "Greenwood Valley High School",
      role: "School Admin",
      status: "Active",
      lastLogin: "1 hour ago"
    },
    {
      id: "USR-007",
      name: "Karan Johar",
      email: "director@silveroakprep.com",
      schoolId: "SCH-1005",
      schoolName: "Silver Oak Preparatory School",
      role: "School Admin",
      status: "Inactive",
      lastLogin: "3 days ago"
    }
  ],

  // 4. Permissions Matrix Data
  permissions: {
    "SCH-1001": {
      schoolName: "St. Xavier's International Academy",
      editable: true,
      addStudent: true,
      deleteStudent: false,
      excelExport: true,
      reports: true,
      deviceLimit: 5
    },
    "SCH-1002": {
      schoolName: "Delhi Public Global School",
      editable: true,
      addStudent: true,
      deleteStudent: true,
      excelExport: true,
      reports: true,
      deviceLimit: 8
    },
    "SCH-1003": {
      schoolName: "Greenwood Valley High School",
      editable: true,
      addStudent: true,
      deleteStudent: false,
      excelExport: true,
      reports: false,
      deviceLimit: 3
    },
    "SCH-1004": {
      schoolName: "Modern English Academy",
      editable: true,
      addStudent: true,
      deleteStudent: false,
      excelExport: false,
      reports: true,
      deviceLimit: 4
    },
    "SCH-1005": {
      schoolName: "Silver Oak Preparatory School",
      editable: false,
      addStudent: false,
      deleteStudent: false,
      excelExport: false,
      reports: false,
      deviceLimit: 1
    },
    "SCH-1006": {
      schoolName: "Horizon Scholars International",
      editable: true,
      addStudent: true,
      deleteStudent: true,
      excelExport: true,
      reports: true,
      deviceLimit: 10
    }
  },

  // 5. Active Sessions & Connected Devices
  sessions: [
    {
      id: "SES-901",
      userId: "USR-001",
      userName: "Super Admin (You)",
      userEmail: "admin@schoolportal.com",
      schoolName: "Global Super Admin",
      deviceType: "Desktop",
      deviceIcon: "laptop",
      browser: "Chrome 128.0",
      os: "Windows 11 Pro",
      ipAddress: "192.168.1.102",
      loginTime: "18 Aug 2026, 09:15 AM",
      lastActivity: "Active Now",
      status: "Active",
      isCurrent: true
    },
    {
      id: "SES-902",
      userId: "USR-004",
      userName: "Vikram Malhotra",
      userEmail: "admin@dpglobalschool.edu",
      schoolName: "Delhi Public Global School",
      deviceType: "Desktop",
      deviceIcon: "laptop",
      browser: "Firefox 129.0",
      os: "macOS Sonoma",
      ipAddress: "103.21.58.42",
      loginTime: "18 Aug 2026, 10:30 AM",
      lastActivity: "2 mins ago",
      status: "Active",
      isCurrent: false
    },
    {
      id: "SES-903",
      userId: "USR-002",
      userName: "Dr. Rajesh Sharma",
      userEmail: "principal@stxaviers.edu",
      schoolName: "St. Xavier's International Academy",
      deviceType: "Mobile",
      deviceIcon: "phone",
      browser: "Safari Mobile 17.5",
      os: "iOS 17.5.1",
      ipAddress: "152.57.18.99",
      loginTime: "18 Aug 2026, 08:45 AM",
      lastActivity: "10 mins ago",
      status: "Active",
      isCurrent: false
    },
    {
      id: "SES-904",
      userId: "USR-006",
      userName: "Pooja Verma",
      userEmail: "headmaster@greenwoodvalley.org",
      schoolName: "Greenwood Valley High School",
      deviceType: "Tablet",
      deviceIcon: "tablet",
      browser: "Chrome Mobile 127.0",
      os: "Android 14 (Galaxy Tab)",
      ipAddress: "182.73.4.12",
      loginTime: "18 Aug 2026, 11:00 AM",
      lastActivity: "1 hour ago",
      status: "Idle",
      isCurrent: false
    },
    {
      id: "SES-905",
      userId: "USR-003",
      userName: "Anita Deshmukh",
      userEmail: "anita.d@stxaviers.edu",
      schoolName: "St. Xavier's International Academy",
      deviceType: "Desktop",
      deviceIcon: "laptop",
      browser: "Edge 128.0",
      os: "Windows 10",
      ipAddress: "49.36.120.8",
      loginTime: "18 Aug 2026, 09:50 AM",
      lastActivity: "2 hours ago",
      status: "Idle",
      isCurrent: false
    }
  ],

  // 6. Activity & Edit Logs
  activityLogs: [
    {
      id: "LOG-5001",
      user: "Vikram Malhotra",
      userEmail: "admin@dpglobalschool.edu",
      school: "Delhi Public Global School",
      action: "Edit",
      module: "Students",
      recordName: "Student #DP-842 (Aarav Gupta)",
      field: "Emergency Contact",
      oldValue: "+91 98765 00001",
      newValue: "+91 98765 99999",
      timestamp: "18 Aug 2026, 11:24 AM"
    },
    {
      id: "LOG-5002",
      user: "Dr. Rajesh Sharma",
      userEmail: "principal@stxaviers.edu",
      school: "St. Xavier's International Academy",
      action: "Add",
      module: "Students",
      recordName: "Student #SX-1049 (Rohan Sen)",
      field: "Admission Profile",
      oldValue: "None",
      newValue: "Enrolled in Grade 9-B",
      timestamp: "18 Aug 2026, 10:48 AM"
    },
    {
      id: "LOG-5003",
      user: "Super Admin",
      userEmail: "admin@schoolportal.com",
      school: "Horizon Scholars International",
      action: "Edit",
      module: "Permissions",
      recordName: "Policy #HSI-2026",
      field: "Device Limit",
      oldValue: "5 Devices",
      newValue: "10 Devices",
      timestamp: "18 Aug 2026, 09:30 AM"
    },
    {
      id: "LOG-5004",
      user: "Pooja Verma",
      userEmail: "headmaster@greenwoodvalley.org",
      school: "Greenwood Valley High School",
      action: "Delete",
      module: "Attendance",
      recordName: "Entry #ATT-882",
      field: "Duplicate Attendance Record",
      oldValue: "Class 7-A (14 Aug 2026)",
      newValue: "Deleted",
      timestamp: "18 Aug 2026, 08:15 AM"
    },
    {
      id: "LOG-5005",
      user: "Anita Deshmukh",
      userEmail: "anita.d@stxaviers.edu",
      school: "St. Xavier's International Academy",
      action: "Edit",
      module: "Fees",
      recordName: "Receipt #RCP-4910",
      field: "Payment Status",
      oldValue: "Pending",
      newValue: "Paid (NetBanking)",
      timestamp: "17 Aug 2026, 04:30 PM"
    }
  ]
};
