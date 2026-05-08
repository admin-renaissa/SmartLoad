
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  email: 'email',
  passwordHash: 'passwordHash',
  name: 'name',
  role: 'role',
  phone: 'phone',
  isActive: 'isActive',
  lastLoginAt: 'lastLoginAt',
  totpSecret: 'totpSecret',
  twoFactorEnabled: 'twoFactorEnabled',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProductCategoryScalarFieldEnum = {
  id: 'id',
  name: 'name',
  slug: 'slug',
  description: 'description',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProductScalarFieldEnum = {
  id: 'id',
  sku: 'sku',
  name: 'name',
  categoryId: 'categoryId',
  hsnCode: 'hsnCode',
  unitOfMeasure: 'unitOfMeasure',
  piecesPerBox: 'piecesPerBox',
  weightPerBoxKg: 'weightPerBoxKg',
  description: 'description',
  materialType: 'materialType',
  specifications: 'specifications',
  usageGuide: 'usageGuide',
  packagingDetails: 'packagingDetails',
  tags: 'tags',
  minStockAlert: 'minStockAlert',
  status: 'status',
  isActive: 'isActive',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  deletedById: 'deletedById',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProductVariantScalarFieldEnum = {
  id: 'id',
  productId: 'productId',
  variantCode: 'variantCode',
  variantName: 'variantName',
  colourCode: 'colourCode',
  colourName: 'colourName',
  lengthMm: 'lengthMm',
  widthMm: 'widthMm',
  thicknessMm: 'thicknessMm',
  piecesPerBox: 'piecesPerBox',
  barcodeValue: 'barcodeValue',
  barcodeFormat: 'barcodeFormat',
  qrCode: 'qrCode',
  imageUrl: 'imageUrl',
  mrpPaise: 'mrpPaise',
  status: 'status',
  isActive: 'isActive',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  deletedById: 'deletedById',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ClientScalarFieldEnum = {
  id: 'id',
  clientCode: 'clientCode',
  name: 'name',
  gstin: 'gstin',
  phone: 'phone',
  email: 'email',
  billingAddress: 'billingAddress',
  shippingAddress: 'shippingAddress',
  contactPersonName: 'contactPersonName',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PurchaseOrderScalarFieldEnum = {
  id: 'id',
  poNumber: 'poNumber',
  clientId: 'clientId',
  orderDate: 'orderDate',
  expectedDispatchDate: 'expectedDispatchDate',
  status: 'status',
  totalAmountPaise: 'totalAmountPaise',
  notes: 'notes',
  tallyVoucherId: 'tallyVoucherId',
  createdById: 'createdById',
  updatedById: 'updatedById',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.POLineItemScalarFieldEnum = {
  id: 'id',
  poId: 'poId',
  variantId: 'variantId',
  orderedBoxes: 'orderedBoxes',
  orderedPieces: 'orderedPieces',
  ratePerBoxPaise: 'ratePerBoxPaise',
  gstPercent: 'gstPercent',
  totalAmountPaise: 'totalAmountPaise',
  loadedBoxes: 'loadedBoxes',
  loadedPieces: 'loadedPieces',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.VehicleScalarFieldEnum = {
  id: 'id',
  registrationNumber: 'registrationNumber',
  type: 'type',
  capacityKg: 'capacityKg',
  driverName: 'driverName',
  driverPhone: 'driverPhone',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ScannerDeviceScalarFieldEnum = {
  id: 'id',
  name: 'name',
  serialNumber: 'serialNumber',
  driverName: 'driverName',
  deviceType: 'deviceType',
  ipAddress: 'ipAddress',
  location: 'location',
  notes: 'notes',
  isActive: 'isActive',
  registeredById: 'registeredById',
  lastSeenAt: 'lastSeenAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DispatchSessionScalarFieldEnum = {
  id: 'id',
  sessionCode: 'sessionCode',
  poId: 'poId',
  vehicleId: 'vehicleId',
  supervisorId: 'supervisorId',
  operatorId: 'operatorId',
  status: 'status',
  openedAt: 'openedAt',
  closedAt: 'closedAt',
  totalBoxesExpected: 'totalBoxesExpected',
  totalBoxesScanned: 'totalBoxesScanned',
  notes: 'notes',
  isPartialDispatch: 'isPartialDispatch',
  partialReason: 'partialReason',
  inventoryDeducted: 'inventoryDeducted',
  tallySynced: 'tallySynced',
  podCreated: 'podCreated',
  manifestPdfUrl: 'manifestPdfUrl',
  challanPdfUrl: 'challanPdfUrl',
  tallyVoucherId: 'tallyVoucherId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ScanEventScalarFieldEnum = {
  id: 'id',
  sessionId: 'sessionId',
  operatorId: 'operatorId',
  scannedBarcode: 'scannedBarcode',
  resolvedVariantId: 'resolvedVariantId',
  result: 'result',
  errorReason: 'errorReason',
  deviceId: 'deviceId',
  scannedAt: 'scannedAt'
};

exports.Prisma.InventoryStockScalarFieldEnum = {
  id: 'id',
  variantId: 'variantId',
  totalBoxes: 'totalBoxes',
  reservedBoxes: 'reservedBoxes',
  updatedAt: 'updatedAt'
};

exports.Prisma.InventoryLedgerScalarFieldEnum = {
  id: 'id',
  variantId: 'variantId',
  movementType: 'movementType',
  boxes: 'boxes',
  pieces: 'pieces',
  referenceType: 'referenceType',
  referenceId: 'referenceId',
  notes: 'notes',
  createdById: 'createdById',
  createdAt: 'createdAt'
};

exports.Prisma.GoodsReceiptNoteScalarFieldEnum = {
  id: 'id',
  grnNumber: 'grnNumber',
  receivedDate: 'receivedDate',
  notes: 'notes',
  tallyVoucherId: 'tallyVoucherId',
  createdById: 'createdById',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.GRNLineItemScalarFieldEnum = {
  id: 'id',
  grnId: 'grnId',
  variantId: 'variantId',
  receivedBoxes: 'receivedBoxes',
  receivedPieces: 'receivedPieces',
  createdAt: 'createdAt'
};

exports.Prisma.ProofOfDeliveryScalarFieldEnum = {
  id: 'id',
  sessionId: 'sessionId',
  linkToken: 'linkToken',
  linkExpiresAt: 'linkExpiresAt',
  otpHash: 'otpHash',
  otpExpiresAt: 'otpExpiresAt',
  otpAttempts: 'otpAttempts',
  status: 'status',
  receiverName: 'receiverName',
  receiverPhone: 'receiverPhone',
  signatureImageUrl: 'signatureImageUrl',
  receiverPhotoUrl: 'receiverPhotoUrl',
  acknowledgedAt: 'acknowledgedAt',
  geoLat: 'geoLat',
  geoLng: 'geoLng',
  discrepancyNotes: 'discrepancyNotes',
  podPdfUrl: 'podPdfUrl',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PODLineItemScalarFieldEnum = {
  id: 'id',
  podId: 'podId',
  lineItemId: 'lineItemId',
  deliveredBoxes: 'deliveredBoxes',
  acknowledgedBoxes: 'acknowledgedBoxes',
  discrepancyBoxes: 'discrepancyBoxes',
  discrepancyReason: 'discrepancyReason',
  createdAt: 'createdAt'
};

exports.Prisma.TallySyncJobScalarFieldEnum = {
  id: 'id',
  direction: 'direction',
  dataType: 'dataType',
  status: 'status',
  referenceId: 'referenceId',
  tallyVoucherId: 'tallyVoucherId',
  requestPayload: 'requestPayload',
  responsePayload: 'responsePayload',
  errorMessage: 'errorMessage',
  attempts: 'attempts',
  nextRetryAt: 'nextRetryAt',
  processedAt: 'processedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AuditLogScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  userEmail: 'userEmail',
  userRole: 'userRole',
  action: 'action',
  resourceType: 'resourceType',
  resourceId: 'resourceId',
  oldValues: 'oldValues',
  newValues: 'newValues',
  ipAddress: 'ipAddress',
  userAgent: 'userAgent',
  createdAt: 'createdAt'
};

exports.Prisma.NotificationScalarFieldEnum = {
  id: 'id',
  recipientPhone: 'recipientPhone',
  recipientEmail: 'recipientEmail',
  channel: 'channel',
  type: 'type',
  status: 'status',
  externalId: 'externalId',
  payload: 'payload',
  sentAt: 'sentAt',
  failedReason: 'failedReason',
  retryCount: 'retryCount',
  createdAt: 'createdAt'
};

exports.Prisma.SystemConfigScalarFieldEnum = {
  id: 'id',
  key: 'key',
  value: 'value',
  description: 'description',
  updatedById: 'updatedById',
  updatedAt: 'updatedAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};

exports.Prisma.UserOrderByRelevanceFieldEnum = {
  id: 'id',
  email: 'email',
  passwordHash: 'passwordHash',
  name: 'name',
  phone: 'phone',
  totpSecret: 'totpSecret'
};

exports.Prisma.ProductCategoryOrderByRelevanceFieldEnum = {
  id: 'id',
  name: 'name',
  slug: 'slug',
  description: 'description'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};

exports.Prisma.ProductOrderByRelevanceFieldEnum = {
  id: 'id',
  sku: 'sku',
  name: 'name',
  categoryId: 'categoryId',
  hsnCode: 'hsnCode',
  unitOfMeasure: 'unitOfMeasure',
  description: 'description',
  materialType: 'materialType',
  usageGuide: 'usageGuide',
  packagingDetails: 'packagingDetails',
  tags: 'tags',
  deletedById: 'deletedById'
};

exports.Prisma.ProductVariantOrderByRelevanceFieldEnum = {
  id: 'id',
  productId: 'productId',
  variantCode: 'variantCode',
  variantName: 'variantName',
  colourCode: 'colourCode',
  colourName: 'colourName',
  barcodeValue: 'barcodeValue',
  qrCode: 'qrCode',
  imageUrl: 'imageUrl',
  deletedById: 'deletedById'
};

exports.Prisma.ClientOrderByRelevanceFieldEnum = {
  id: 'id',
  clientCode: 'clientCode',
  name: 'name',
  gstin: 'gstin',
  phone: 'phone',
  email: 'email',
  contactPersonName: 'contactPersonName'
};

exports.Prisma.PurchaseOrderOrderByRelevanceFieldEnum = {
  id: 'id',
  poNumber: 'poNumber',
  clientId: 'clientId',
  notes: 'notes',
  tallyVoucherId: 'tallyVoucherId',
  createdById: 'createdById',
  updatedById: 'updatedById'
};

exports.Prisma.POLineItemOrderByRelevanceFieldEnum = {
  id: 'id',
  poId: 'poId',
  variantId: 'variantId'
};

exports.Prisma.VehicleOrderByRelevanceFieldEnum = {
  id: 'id',
  registrationNumber: 'registrationNumber',
  driverName: 'driverName',
  driverPhone: 'driverPhone'
};

exports.Prisma.ScannerDeviceOrderByRelevanceFieldEnum = {
  id: 'id',
  name: 'name',
  serialNumber: 'serialNumber',
  driverName: 'driverName',
  deviceType: 'deviceType',
  ipAddress: 'ipAddress',
  location: 'location',
  notes: 'notes',
  registeredById: 'registeredById'
};

exports.Prisma.DispatchSessionOrderByRelevanceFieldEnum = {
  id: 'id',
  sessionCode: 'sessionCode',
  poId: 'poId',
  vehicleId: 'vehicleId',
  supervisorId: 'supervisorId',
  operatorId: 'operatorId',
  notes: 'notes',
  partialReason: 'partialReason',
  manifestPdfUrl: 'manifestPdfUrl',
  challanPdfUrl: 'challanPdfUrl',
  tallyVoucherId: 'tallyVoucherId'
};

exports.Prisma.ScanEventOrderByRelevanceFieldEnum = {
  id: 'id',
  sessionId: 'sessionId',
  operatorId: 'operatorId',
  scannedBarcode: 'scannedBarcode',
  resolvedVariantId: 'resolvedVariantId',
  errorReason: 'errorReason',
  deviceId: 'deviceId'
};

exports.Prisma.InventoryStockOrderByRelevanceFieldEnum = {
  id: 'id',
  variantId: 'variantId'
};

exports.Prisma.InventoryLedgerOrderByRelevanceFieldEnum = {
  id: 'id',
  variantId: 'variantId',
  referenceType: 'referenceType',
  referenceId: 'referenceId',
  notes: 'notes',
  createdById: 'createdById'
};

exports.Prisma.GoodsReceiptNoteOrderByRelevanceFieldEnum = {
  id: 'id',
  grnNumber: 'grnNumber',
  notes: 'notes',
  tallyVoucherId: 'tallyVoucherId',
  createdById: 'createdById'
};

exports.Prisma.GRNLineItemOrderByRelevanceFieldEnum = {
  id: 'id',
  grnId: 'grnId',
  variantId: 'variantId'
};

exports.Prisma.ProofOfDeliveryOrderByRelevanceFieldEnum = {
  id: 'id',
  sessionId: 'sessionId',
  linkToken: 'linkToken',
  otpHash: 'otpHash',
  receiverName: 'receiverName',
  receiverPhone: 'receiverPhone',
  signatureImageUrl: 'signatureImageUrl',
  receiverPhotoUrl: 'receiverPhotoUrl',
  discrepancyNotes: 'discrepancyNotes',
  podPdfUrl: 'podPdfUrl'
};

exports.Prisma.PODLineItemOrderByRelevanceFieldEnum = {
  id: 'id',
  podId: 'podId',
  lineItemId: 'lineItemId',
  discrepancyReason: 'discrepancyReason'
};

exports.Prisma.TallySyncJobOrderByRelevanceFieldEnum = {
  id: 'id',
  referenceId: 'referenceId',
  tallyVoucherId: 'tallyVoucherId',
  errorMessage: 'errorMessage'
};

exports.Prisma.AuditLogOrderByRelevanceFieldEnum = {
  id: 'id',
  userId: 'userId',
  userEmail: 'userEmail',
  userRole: 'userRole',
  action: 'action',
  resourceType: 'resourceType',
  resourceId: 'resourceId',
  ipAddress: 'ipAddress',
  userAgent: 'userAgent'
};

exports.Prisma.NotificationOrderByRelevanceFieldEnum = {
  id: 'id',
  recipientPhone: 'recipientPhone',
  recipientEmail: 'recipientEmail',
  type: 'type',
  externalId: 'externalId',
  failedReason: 'failedReason'
};

exports.Prisma.SystemConfigOrderByRelevanceFieldEnum = {
  id: 'id',
  key: 'key',
  value: 'value',
  description: 'description',
  updatedById: 'updatedById'
};
exports.UserRole = exports.$Enums.UserRole = {
  ADMIN: 'ADMIN',
  SUPERVISOR: 'SUPERVISOR',
  OPERATOR: 'OPERATOR',
  ACCOUNTS: 'ACCOUNTS',
  DRIVER: 'DRIVER',
  CLIENT: 'CLIENT'
};

exports.ProductStatus = exports.$Enums.ProductStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  ARCHIVED: 'ARCHIVED'
};

exports.BarcodeFormat = exports.$Enums.BarcodeFormat = {
  QR: 'QR',
  CODE128: 'CODE128',
  CODE39: 'CODE39',
  DATAMATRIX: 'DATAMATRIX',
  EAN13: 'EAN13',
  UNKNOWN: 'UNKNOWN'
};

exports.POStatus = exports.$Enums.POStatus = {
  DRAFT: 'DRAFT',
  CONFIRMED: 'CONFIRMED',
  PARTIALLY_LOADED: 'PARTIALLY_LOADED',
  FULLY_LOADED: 'FULLY_LOADED',
  DISPATCHED: 'DISPATCHED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  CLOSED: 'CLOSED'
};

exports.VehicleType = exports.$Enums.VehicleType = {
  TRUCK: 'TRUCK',
  TEMPO: 'TEMPO',
  VAN: 'VAN',
  MINI_TRUCK: 'MINI_TRUCK',
  PICKUP: 'PICKUP',
  CONTAINER: 'CONTAINER'
};

exports.SessionStatus = exports.$Enums.SessionStatus = {
  OPEN: 'OPEN',
  PAUSED: 'PAUSED',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED'
};

exports.ScanResult = exports.$Enums.ScanResult = {
  SUCCESS: 'SUCCESS',
  WRONG_PRODUCT: 'WRONG_PRODUCT',
  WRONG_COLOUR: 'WRONG_COLOUR',
  EXCESS_QUANTITY: 'EXCESS_QUANTITY',
  UNKNOWN_BARCODE: 'UNKNOWN_BARCODE',
  DUPLICATE_SCAN: 'DUPLICATE_SCAN',
  SESSION_CLOSED: 'SESSION_CLOSED'
};

exports.MovementType = exports.$Enums.MovementType = {
  INWARD: 'INWARD',
  OUTWARD: 'OUTWARD',
  ADJUSTMENT_ADD: 'ADJUSTMENT_ADD',
  ADJUSTMENT_SUB: 'ADJUSTMENT_SUB',
  TRANSFER_IN: 'TRANSFER_IN',
  TRANSFER_OUT: 'TRANSFER_OUT',
  RETURN_INWARD: 'RETURN_INWARD'
};

exports.PODStatus = exports.$Enums.PODStatus = {
  PENDING: 'PENDING',
  LINK_SENT: 'LINK_SENT',
  OTP_VERIFIED: 'OTP_VERIFIED',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  DISPUTED: 'DISPUTED',
  EXPIRED: 'EXPIRED'
};

exports.TallySyncDirection = exports.$Enums.TallySyncDirection = {
  PUSH: 'PUSH',
  PULL: 'PULL'
};

exports.TallySyncDataType = exports.$Enums.TallySyncDataType = {
  DISPATCH_OUTWARD: 'DISPATCH_OUTWARD',
  GRN_INWARD: 'GRN_INWARD',
  PULL_STOCK_ITEMS: 'PULL_STOCK_ITEMS',
  PULL_PARTIES: 'PULL_PARTIES',
  PULL_ORDERS: 'PULL_ORDERS',
  RECONCILIATION: 'RECONCILIATION'
};

exports.TallySyncStatus = exports.$Enums.TallySyncStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  PERMANENTLY_FAILED: 'PERMANENTLY_FAILED'
};

exports.NotificationChannel = exports.$Enums.NotificationChannel = {
  SMS: 'SMS',
  WHATSAPP: 'WHATSAPP',
  EMAIL: 'EMAIL'
};

exports.NotificationStatus = exports.$Enums.NotificationStatus = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
  DELIVERED: 'DELIVERED'
};

exports.Prisma.ModelName = {
  User: 'User',
  ProductCategory: 'ProductCategory',
  Product: 'Product',
  ProductVariant: 'ProductVariant',
  Client: 'Client',
  PurchaseOrder: 'PurchaseOrder',
  POLineItem: 'POLineItem',
  Vehicle: 'Vehicle',
  ScannerDevice: 'ScannerDevice',
  DispatchSession: 'DispatchSession',
  ScanEvent: 'ScanEvent',
  InventoryStock: 'InventoryStock',
  InventoryLedger: 'InventoryLedger',
  GoodsReceiptNote: 'GoodsReceiptNote',
  GRNLineItem: 'GRNLineItem',
  ProofOfDelivery: 'ProofOfDelivery',
  PODLineItem: 'PODLineItem',
  TallySyncJob: 'TallySyncJob',
  AuditLog: 'AuditLog',
  Notification: 'Notification',
  SystemConfig: 'SystemConfig'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
