import type { Room, Guest, Invoice, Lead, MaintenanceTicket, SpecialBooking, DashboardStats } from './types'

export const rooms: Room[] = [
  // Safina Plaza 2nd Floor - Private
  { id: 'r1', number: '201', property: 'safina-plaza', floor: '2nd', type: 'private', entity: 'feazzo', monthlyRate: 32000, weeklyRate: 9500, beds: [{ id: 'r1b1', bedNumber: 1, status: 'occupied', guestId: 'g1', guestName: 'Arjun Mehta', genderRestriction: 'male', checkIn: '2026-05-01', tier: 'monthly' }] },
  { id: 'r2', number: '202', property: 'safina-plaza', floor: '2nd', type: 'private', entity: 'feazzo', monthlyRate: 32000, weeklyRate: 9500, beds: [{ id: 'r2b1', bedNumber: 1, status: 'incoming', guestId: 'g2', guestName: 'Priya Sharma', genderRestriction: 'female', checkIn: '2026-06-20', tier: 'monthly' }] },
  { id: 'r3', number: '203', property: 'safina-plaza', floor: '2nd', type: 'private', entity: 'feazzo', monthlyRate: 32000, weeklyRate: 9500, beds: [{ id: 'r3b1', bedNumber: 1, status: 'vacant', genderRestriction: 'male' }] },
  // Safina Plaza 2nd Floor - Sharing
  { id: 'r4', number: '204', property: 'safina-plaza', floor: '2nd', type: 'sharing', entity: 'feazzo', monthlyRate: 22000, weeklyRate: 6500, beds: [
    { id: 'r4b1', bedNumber: 1, status: 'occupied', guestId: 'g3', guestName: 'Karan Patel', genderRestriction: 'male', checkIn: '2026-04-15', tier: 'monthly' },
    { id: 'r4b2', bedNumber: 2, status: 'occupied', guestId: 'g4', guestName: 'Rahul Singh', genderRestriction: 'male', checkIn: '2026-05-10', tier: 'open-ended' }
  ]},
  { id: 'r5', number: '205', property: 'safina-plaza', floor: '2nd', type: 'sharing', entity: 'feazzo', monthlyRate: 22000, weeklyRate: 6500, beds: [
    { id: 'r5b1', bedNumber: 1, status: 'occupied', guestId: 'g5', guestName: 'Ananya Iyer', genderRestriction: 'female', checkIn: '2026-05-20', tier: 'monthly' },
    { id: 'r5b2', bedNumber: 2, status: 'vacant', genderRestriction: 'female' }
  ]},
  // Safina Plaza 3rd Floor
  { id: 'r6', number: '301', property: 'safina-plaza', floor: '3rd', type: 'private', entity: 'feazzo', monthlyRate: 26000, weeklyRate: 7800, beds: [{ id: 'r6b1', bedNumber: 1, status: 'occupied', guestId: 'g6', guestName: 'Dev Nair', genderRestriction: 'male', checkIn: '2026-03-01', checkOut: '2026-07-01', tier: 'monthly' }] },
  { id: 'r7', number: '302', property: 'safina-plaza', floor: '3rd', type: 'private', entity: 'feazzo', monthlyRate: 26000, weeklyRate: 7800, beds: [{ id: 'r7b1', bedNumber: 1, status: 'blocked', genderRestriction: 'male' }], isBlocked: true, blockReason: 'Under renovation — plumbing repair' },
  { id: 'r8', number: '303', property: 'safina-plaza', floor: '3rd', type: 'sharing', entity: 'feazzo', monthlyRate: 18000, weeklyRate: 5500, beds: [
    { id: 'r8b1', bedNumber: 1, status: 'occupied', guestId: 'g7', guestName: 'Meera Krishnan', genderRestriction: 'female', checkIn: '2026-06-01', tier: 'monthly' },
    { id: 'r8b2', bedNumber: 2, status: 'incoming', guestId: 'g8', guestName: 'Sneha Roy', genderRestriction: 'female', checkIn: '2026-06-18' }
  ]},
  { id: 'r9', number: '304', property: 'safina-plaza', floor: '3rd', type: 'sharing', entity: 'feazzo', monthlyRate: 18000, weeklyRate: 5500, beds: [
    { id: 'r9b1', bedNumber: 1, status: 'special', genderRestriction: 'male' },
    { id: 'r9b2', bedNumber: 2, status: 'vacant', genderRestriction: 'male' }
  ], specialBookingType: 'owners-guest' },
  // Peepal Tree
  { id: 'r10', number: 'PT-101', property: 'peepal-tree', floor: 'all', type: 'private', entity: 'safina-ventures', monthlyRate: 24000, weeklyRate: 7200, beds: [{ id: 'r10b1', bedNumber: 1, status: 'occupied', guestId: 'g9', guestName: 'Vikram Joshi', genderRestriction: 'male', checkIn: '2026-04-01', tier: 'monthly' }] },
  { id: 'r11', number: 'PT-102', property: 'peepal-tree', floor: 'all', type: 'private', entity: 'safina-ventures', monthlyRate: 24000, weeklyRate: 7200, beds: [{ id: 'r11b1', bedNumber: 1, status: 'vacant', genderRestriction: 'female' }] },
  { id: 'r12', number: 'PT-103', property: 'peepal-tree', floor: 'all', type: 'sharing', entity: 'safina-ventures', monthlyRate: 18550, weeklyRate: 5800, beds: [
    { id: 'r12b1', bedNumber: 1, status: 'occupied', guestId: 'g10', guestName: 'Aisha Khan', genderRestriction: 'female', checkIn: '2026-05-05', tier: 'open-ended' },
    { id: 'r12b2', bedNumber: 2, status: 'occupied', guestId: 'g11', guestName: 'Fatima Malik', genderRestriction: 'female', checkIn: '2026-06-01', tier: 'monthly' }
  ]},
  { id: 'r13', number: 'PT-104', property: 'peepal-tree', floor: 'all', type: 'sharing', entity: 'safina-ventures', monthlyRate: 18550, weeklyRate: 5800, beds: [
    { id: 'r13b1', bedNumber: 1, status: 'occupied', guestId: 'g12', guestName: 'Rohan Das', genderRestriction: 'male', checkIn: '2026-05-15', tier: 'monthly' },
    { id: 'r13b2', bedNumber: 2, status: 'vacant', genderRestriction: 'male' }
  ]},
]

export const leads: Lead[] = [
  { id: 'l1', name: 'Siddharth Rao', email: 'sid@example.com', phone: '9876543210', gender: 'male', source: 'online', property: 'safina-plaza', roomType: 'private', preferredCheckIn: '2026-07-01', stage: 'viewed', roomShown: '203', bookingLinkSent: true, bookingLinkExpiry: '2026-06-18', createdAt: '2026-06-15', updatedAt: '2026-06-17' },
  { id: 'l2', name: 'Divya Menon', email: 'divya@example.com', phone: '9812345678', gender: 'female', source: 'walk-in', property: 'peepal-tree', roomType: 'sharing', stage: 'viewing-scheduled', createdAt: '2026-06-16', updatedAt: '2026-06-17' },
  { id: 'l3', name: 'Nikhil Gupta', email: 'nikhil@example.com', phone: '9887654321', gender: 'male', source: 'referral', property: 'safina-plaza', roomType: 'sharing', stage: 'captured', createdAt: '2026-06-17', updatedAt: '2026-06-17' },
  { id: 'l4', name: 'Riya Chandra', email: 'riya@example.com', phone: '9765432100', gender: 'female', source: 'online', property: 'peepal-tree', roomType: 'private', stage: 'deposit-paid', createdAt: '2026-06-10', updatedAt: '2026-06-14' },
  { id: 'l5', name: 'Amit Shah', email: 'amit@example.com', phone: '9654321009', gender: 'male', source: 'walk-in', stage: 'dropped-off', dropReason: 'Budget constraints', createdAt: '2026-06-12', updatedAt: '2026-06-15' },
  { id: 'l6', name: 'Pooja Agarwal', email: 'pooja@example.com', phone: '9543210098', gender: 'female', source: 'online', property: 'safina-plaza', roomType: 'sharing', stage: 'checked-in', createdAt: '2026-06-01', updatedAt: '2026-06-10' },
  { id: 'l7', name: 'Rajesh Kumar', email: 'rajesh@example.com', phone: '9432100987', gender: 'male', source: 'referral', property: 'peepal-tree', roomType: 'private', preferredCheckIn: '2026-07-15', stage: 'viewed', roomShown: 'PT-101', bookingLinkSent: false, createdAt: '2026-06-16', updatedAt: '2026-06-17' },
]

export const invoices: Invoice[] = [
  { id: 'inv1', guestId: 'g1', guestName: 'Arjun Mehta', roomId: 'r1', property: 'safina-plaza', entity: 'feazzo', period: 'Jun 2026', amount: 32000, dueDate: '2026-06-03', status: 'paid', createdAt: '2026-05-26', paidAt: '2026-06-02' },
  { id: 'inv2', guestId: 'g3', guestName: 'Karan Patel', roomId: 'r4', property: 'safina-plaza', entity: 'feazzo', period: 'Jun 2026', amount: 22000, dueDate: '2026-06-03', status: 'paid', createdAt: '2026-05-26', paidAt: '2026-06-01' },
  { id: 'inv3', guestId: 'g4', guestName: 'Rahul Singh', roomId: 'r4', property: 'safina-plaza', entity: 'feazzo', period: 'Jun 2026', amount: 22000, dueDate: '2026-06-03', status: 'overdue', lateFee: 7000, createdAt: '2026-05-26' },
  { id: 'inv4', guestId: 'g5', guestName: 'Ananya Iyer', roomId: 'r5', property: 'safina-plaza', entity: 'feazzo', period: 'Jun 2026', amount: 14667, dueDate: '2026-06-03', status: 'paid', createdAt: '2026-05-26', paidAt: '2026-06-03' },
  { id: 'inv5', guestId: 'g6', guestName: 'Dev Nair', roomId: 'r6', property: 'safina-plaza', entity: 'feazzo', period: 'Jun 2026', amount: 26000, dueDate: '2026-06-03', status: 'unpaid', createdAt: '2026-05-26' },
  { id: 'inv6', guestId: 'g9', guestName: 'Vikram Joshi', roomId: 'r10', property: 'peepal-tree', entity: 'safina-ventures', period: 'Jun 2026', amount: 24000, dueDate: '2026-06-03', status: 'paid', createdAt: '2026-05-26', paidAt: '2026-06-02' },
  { id: 'inv7', guestId: 'g10', guestName: 'Aisha Khan', roomId: 'r12', property: 'peepal-tree', entity: 'safina-ventures', period: 'Jun 2026', amount: 18550, dueDate: '2026-06-03', status: 'overdue', lateFee: 3500, createdAt: '2026-05-26' },
  { id: 'inv8', guestId: 'g11', guestName: 'Fatima Malik', roomId: 'r12', property: 'peepal-tree', entity: 'safina-ventures', period: 'Jun 2026', amount: 11405, dueDate: '2026-06-03', status: 'paid', createdAt: '2026-05-26', paidAt: '2026-06-03' },
  { id: 'inv9', guestId: 'g12', guestName: 'Rohan Das', roomId: 'r13', property: 'peepal-tree', entity: 'safina-ventures', period: 'Jun 2026', amount: 18550, dueDate: '2026-06-03', status: 'unpaid', createdAt: '2026-05-26' },
]

export const tickets: MaintenanceTicket[] = [
  { id: 't1', roomId: 'r4', roomNumber: '204', property: 'safina-plaza', guestId: 'g3', description: 'AC not cooling properly. Room temperature stays above 28°C even at lowest setting.', location: '204 - Bedroom', urgency: 'high', status: 'in-progress', assignedTo: 'Suresh Kumar', createdAt: '2026-06-15', isRecurring: false },
  { id: 't2', roomId: 'r8', roomNumber: '303', property: 'safina-plaza', guestId: 'g7', description: 'Bathroom tap is leaking constantly.', location: '303 - Bathroom', urgency: 'medium', status: 'open', createdAt: '2026-06-16' },
  { id: 't3', roomId: 'r10', roomNumber: 'PT-101', property: 'peepal-tree', guestId: 'g9', description: 'WiFi signal very weak in room.', location: 'PT-101', urgency: 'low', status: 'open', createdAt: '2026-06-17' },
  { id: 't4', roomId: 'r6', roomNumber: '301', property: 'safina-plaza', guestId: 'g6', description: 'Door lock is stiff and takes multiple attempts to open.', location: '301 - Main Door', urgency: 'high', status: 'resolved', assignedTo: 'Ravi Electricals', createdAt: '2026-06-12', resolvedAt: '2026-06-13' },
  { id: 't5', roomId: 'r12', roomNumber: 'PT-103', property: 'peepal-tree', guestId: 'g10', description: 'Geyser not heating water.', location: 'PT-103 - Bathroom', urgency: 'high', status: 'open', createdAt: '2026-06-17', isRecurring: true },
]

export const specialBookings: SpecialBooking[] = [
  { id: 'sb1', type: 'owners-guest', roomId: 'r9', roomNumber: '304', property: 'safina-plaza', requestedBy: 'Azaan Safina', approvedBy: 'Admin', guestName: 'Khalid Al-Rashid', isZeroCharge: true, azaanNotified: true, checkIn: '2026-06-15', checkOut: '2026-06-25', auditLog: [{ action: 'Created', by: 'Azaan Safina', at: '2026-06-14T10:30:00Z' }, { action: 'Approved', by: 'Admin', at: '2026-06-14T11:00:00Z' }] },
]

export const dashboardStats: DashboardStats = {
  totalRooms: 22,
  occupiedRooms: 13,
  vacantRooms: 6,
  incomingRooms: 2,
  blockedRooms: 1,
  occupancyRate: 72,
  totalLeads: 7,
  conversionRate: 43,
  revenueThisMonth: 183872,
  outstandingPayments: 71550,
  pendingRefunds: 2,
  openTickets: 4,
}

export const revenueByMonth = [
  { month: 'Jan', safina: 145000, peepal: 82000 },
  { month: 'Feb', safina: 152000, peepal: 79000 },
  { month: 'Mar', safina: 168000, peepal: 91000 },
  { month: 'Apr', safina: 175000, peepal: 95000 },
  { month: 'May', safina: 181000, peepal: 98000 },
  { month: 'Jun', safina: 113872, peepal: 70000 },
]

export const occupancyTrend = [
  { month: 'Jan', rate: 58 },
  { month: 'Feb', rate: 62 },
  { month: 'Mar', rate: 67 },
  { month: 'Apr', rate: 71 },
  { month: 'May', rate: 75 },
  { month: 'Jun', rate: 72 },
]
