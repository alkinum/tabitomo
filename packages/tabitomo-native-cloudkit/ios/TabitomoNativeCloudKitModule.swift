import CloudKit
import ExpoModulesCore

public final class TabitomoNativeCloudKitModule: Module {
  private let settingsRecordID = CKRecord.ID(recordName: "settings-v1")
  private let settingsRecordType = "TabitomoSettings"

  private var database: CKDatabase {
    CKContainer.default().privateCloudDatabase
  }

  public func definition() -> ModuleDefinition {
    Name("TabitomoNativeCloudKit")

    AsyncFunction("getAccountStatusAsync") { (promise: Promise) in
      CKContainer.default().accountStatus { status, error in
        if let error {
          promise.reject("ERR_CLOUDKIT_ACCOUNT_STATUS", error.localizedDescription)
          return
        }
        promise.resolve(self.accountStatusLabel(status))
      }
    }

    AsyncFunction("loadSettingsAsync") { (promise: Promise) in
      self.database.fetch(withRecordID: self.settingsRecordID) { record, error in
        if let cloudError = error as? CKError, cloudError.code == .unknownItem {
          promise.resolve(nil)
          return
        }
        if let error {
          promise.reject("ERR_CLOUDKIT_LOAD_FAILED", error.localizedDescription)
          return
        }
        guard let record, let payload = self.settingsPayload(from: record) else {
          promise.resolve(nil)
          return
        }
        promise.resolve(self.snapshot(payload: payload, record: record))
      }
    }

    AsyncFunction("saveSettingsAsync") { (payload: String, updatedAt: Double, promise: Promise) in
      self.database.fetch(withRecordID: self.settingsRecordID) { existingRecord, fetchError in
        let record: CKRecord
        if let existingRecord {
          let existingUpdatedAt = (existingRecord["updatedAt"] as? NSNumber)?.doubleValue ?? 0
          if existingUpdatedAt > updatedAt, let existingPayload = self.settingsPayload(from: existingRecord) {
            promise.resolve(self.snapshot(payload: existingPayload, record: existingRecord))
            return
          }
          record = existingRecord
        } else if let cloudError = fetchError as? CKError, cloudError.code == .unknownItem {
          record = CKRecord(recordType: self.settingsRecordType, recordID: self.settingsRecordID)
        } else if let fetchError {
          promise.reject("ERR_CLOUDKIT_PREPARE_SAVE_FAILED", fetchError.localizedDescription)
          return
        } else {
          record = CKRecord(recordType: self.settingsRecordType, recordID: self.settingsRecordID)
        }

        record.encryptedValues["payload"] = payload as NSString
        record["updatedAt"] = NSNumber(value: updatedAt)

        self.database.save(record) { savedRecord, saveError in
          if let saveError {
            promise.reject("ERR_CLOUDKIT_SAVE_FAILED", saveError.localizedDescription)
            return
          }
          guard let savedRecord else {
            promise.reject("ERR_CLOUDKIT_SAVE_FAILED", "CloudKit returned no saved settings record.")
            return
          }
          promise.resolve(self.snapshot(payload: payload, record: savedRecord))
        }
      }
    }

    AsyncFunction("deleteSettingsAsync") { (promise: Promise) in
      self.database.delete(withRecordID: self.settingsRecordID) { _, error in
        if let cloudError = error as? CKError, cloudError.code == .unknownItem {
          promise.resolve(false)
          return
        }
        if let error {
          promise.reject("ERR_CLOUDKIT_DELETE_FAILED", error.localizedDescription)
          return
        }
        promise.resolve(true)
      }
    }
  }

  private func settingsPayload(from record: CKRecord) -> String? {
    if let encryptedPayload = record.encryptedValues["payload"] as? String {
      return encryptedPayload
    }
    return record["payload"] as? String
  }

  private func snapshot(payload: String, record: CKRecord) -> [String: Any] {
    let updatedAt = (record["updatedAt"] as? NSNumber)?.doubleValue
      ?? record.modificationDate.map { $0.timeIntervalSince1970 * 1000 }
      ?? 0
    return [
      "payload": payload,
      "updatedAt": updatedAt
    ]
  }

  private func accountStatusLabel(_ status: CKAccountStatus) -> String {
    switch status {
    case .available:
      return "available"
    case .noAccount:
      return "no-account"
    case .restricted:
      return "restricted"
    case .temporarilyUnavailable:
      return "temporarily-unavailable"
    case .couldNotDetermine:
      return "could-not-determine"
    @unknown default:
      return "could-not-determine"
    }
  }
}
