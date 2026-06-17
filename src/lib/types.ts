export type Property = 'safina-plaza' | 'peepal-tree'
export type Floor = '1st' | '2nd' | '3rd' | 'all'
export type RoomType = 'private' | 'sharing'
export type BedStatus = 'occupied' | 'vacant' | 'incoming' | 'blocked' | 'special'
export type BookingTier = 'weekly' | 'monthly' | 'open-ended'
export type Entity = 'feazzo' | 'safina-ventures'
export type UserRole = 'sales' | 'operations' | 'finance' | 'admin'
export type Gender = 'male' | 'female' | 'other'
export type LeadStage = 'captured' | 'viewing-scheduled' | 'viewed' | 'deposit-paid' | 'checked-in' | 'dropped-off'
export type LeadSource = 'walk-in' | 'online' | 'referral'
export type TicketStatus = 'open' | 'in-progress' | 'resolved'
export type TicketUrgency = 'low' | 'medium' | 'high'
export type PaymentStatus = 'paid' | 'unpaid' | 'overdue' | 'processing'
export type SpecialBookingType = 'airbnb' | 'owners-guest' | 'team-discounted' | 'team-complimentary'

export interface Bed {
  depositPaid?: boolean
  id: string
  bedNumber: 1 | 2
  status: BedStatus
  guestId?: string
  guestName?: string
  genderRestriction: Gender
  checkIn?: string
  checkOut?: string
  tier?: BookingTier
}

export interface Room {
  id: string
  number: string
  property: Property
  floor: Floor
  type: RoomType
  entity: Entity
  beds: Bed[]
  monthlyRate: number
  weeklyRate: number
  isBlocked?: boolean
  blockReason?: string
  specialBookingType?: SpecialBookingType
}

export interface Guest {
  id: string
  fullName: string
  gender: Gender
  email: string
  phone: string
  workplace?: string
  linkedIn?: string
  idType: 'aadhaar' | 'passport' | 'pan' | 'driving-licence'
  idNumber: string
  emergencyContact: { name: string; phone: string; relationship: string }
  roomId: string
  bedId?: string
  property: Property
  checkIn: string
  checkOut?: string
  tier: BookingTier
  deposit: number
  depositStatus: 'held' | 'refunded' | 'forfeited'
  noticeAcknowledged?: boolean
  isPlus1?: boolean
  primaryGuestId?: string
}

export interface Invoice {
  id: string
  guestId: string
  guestName: string
  roomId: string
  property: Property
  entity: Entity
  period: string
  amount: number
  dueDate: string
  status: PaymentStatus
  lateFee?: number
  createdAt: string
  paidAt?: string
}

export interface Lead {
  id: string
  name: string
  email: string
  phone: string
  gender: Gender
  source: LeadSource
  property?: Property
  roomType?: RoomType
  preferredCheckIn?: string
  stage: LeadStage
  roomShown?: string
  bookingLinkSent?: boolean
  bookingLinkExpiry?: string
  notes?: string
  createdAt: string
  updatedAt: string
  dropReason?: string
}

export interface MaintenanceTicket {
  id: string
  roomId: string
  roomNumber: string
  property: Property
  guestId?: string
  description: string
  location: string
  urgency: TicketUrgency
  status: TicketStatus
  assignedTo?: string
  createdAt: string
  resolvedAt?: string
  isRecurring?: boolean
}

export interface SpecialBooking {
  id: string
  type: SpecialBookingType
  roomId: string
  roomNumber: string
  property: Property
  requestedBy: string
  approvedBy?: string
  guestName?: string
  customTariff?: number
  isZeroCharge: boolean
  auditLog: { action: string; by: string; at: string }[]
  azaanNotified: boolean
  checkIn: string
  checkOut?: string
  notes?: string
}

export interface DashboardStats {
  totalRooms: number
  occupiedRooms: number
  vacantRooms: number
  incomingRooms: number
  blockedRooms: number
  occupancyRate: number
  totalLeads: number
  conversionRate: number
  revenueThisMonth: number
  outstandingPayments: number
  pendingRefunds: number
  openTickets: number
}
