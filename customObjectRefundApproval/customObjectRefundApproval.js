import { LightningElement, track, wire, api } from 'lwc';
import { getRecord, getFieldValue, updateRecord } from 'lightning/uiRecordApi';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';
import APPROVED_AT from '@salesforce/schema/Account.ApprovedAt__c';
import REFUNDS_APPROVED_COUNT from '@salesforce/schema/Account.Total_Refunds_Approved__c';
import CASE_ACCOUNT_ID_FIELD from '@salesforce/schema/Case.AccountId';
import CASE_TYPE_FIELD from '@salesforce/schema/Case.Type';
import CASE_AMOUNT_REFUNDED_FIELD from '@salesforce/schema/Case.Amount_Refunded__c';
import CASE_REFUND_FIELD from '@salesforce/schema/Case.Refund_Approved__c';
import CASE_REFUND_DECISION_FIELD from '@salesforce/schema/Case.Refund_Decision_Outcome__c';
import CASE_REFUND_REASON_FIELD from '@salesforce/schema/Case.Refund_Decision_Reason__c';
import CASE_REFUND_SL_REQ_FIELD from '@salesforce/schema/Case.Refund_Request_SLs_Requested__c';
import CASE_REFUND_REQUEST_TOTAL_FIELD from '@salesforce/schema/Case.Refund_Request_Total_Amount__c';
import CASE_REFUND_NOTES_FIELD from '@salesforce/schema/Case.Refund_Request_Notes__c';
import CASE_SLS_REFUNDED_FIELD from '@salesforce/schema/Case.Refunds_Approved__c';

const RATIO_LOWER = 0.25;
const RATIO_UPPER = 0.40;
const EXPERIENCE_DAYS = 100;
const EXPERIENCE_SHORTLISTS = 16;
const MAX_SHORTLISTS = 3;
const MAX_FEE = 60;
const APPROVED_MESSAGE = 'Refund Approved';
const HOLD_MESSAGE = 'Hold & Call';
const DENIED_MESSAGE = 'Denied';

export default class CustomObjectRefundApproval extends LightningElement {
    @api recordId;
    @track shortlistCount = 0;
    @track showResult = false;
    @track resultMessage = '';
    @track resultStyle = '';
    @track resultReason = '';
    @track shortlistsRequested = 0;
    @track totalSum = 0;
    @track showShortlistsRequestedError = false;
    @track showTotalSumError = false;
    @track showShortlistCountError = false;
    @track showFirstAtiDateError = false;
    @track refundNotes = '';
    @track amountRefunded = 0;
    @track refundsApproved = 0;
    @track caseType = 'Refund Request';
    @track refundApproved;
    @track refundDecisionOutcome = '';
    @track refundDecisionReason = '';

    @wire(getRecord, { recordId: '$recordId', fields: [CASE_ACCOUNT_ID_FIELD, CASE_TYPE_FIELD, CASE_AMOUNT_REFUNDED_FIELD, CASE_REFUND_FIELD, CASE_REFUND_DECISION_FIELD, 
      CASE_REFUND_REASON_FIELD, CASE_REFUND_SL_REQ_FIELD, CASE_REFUND_REQUEST_TOTAL_FIELD, CASE_REFUND_NOTES_FIELD, CASE_SLS_REFUNDED_FIELD] })
    caseRecord;

    @wire(getRecord, { recordId: '$accountId', fields: [REFUNDS_APPROVED_COUNT, APPROVED_AT] })
    accountRecord;

    get accountId() {
        return this.caseRecord.data ? getFieldValue(this.caseRecord.data, CASE_ACCOUNT_ID_FIELD) : null;
    }

    get refundsCount() {
        return getFieldValue(this.accountRecord.data, REFUNDS_APPROVED_COUNT);
    }

    get approvedAt() {
        return getFieldValue(this.accountRecord.data, APPROVED_AT);
    }

    get approvedAt() {
      return getFieldValue(this.accountRecord.data, APPROVED_AT);
    }
  
    get firstAtiDate() {
      const approvedAt = this.approvedAt;
      if (approvedAt) {
          const approvedAtDate = new Date(approvedAt);
          return approvedAtDate.toISOString().split('T')[0];
      }
      return '';
    }
  
    

    showToast(title, message, variant) {
      const evt = new ShowToastEvent({
          title: title,
          message: message,
          variant: variant
      });
      this.dispatchEvent(evt);
    }

    handleTotalSumChange(event) {
        this.totalSum = event.target.value;
        // Hide the error message when the user starts typing
        this.showTotalSumError = false;
    }

    handleShortlistsRequestedChange(event) {
        this.shortlistsRequested = event.target.value;
        // Hide the error message when the user starts typing
        this.showShortlistsRequestedError = false;
    }

    handleShortlistCountChange(event) {
        this.shortlistCount = event.target.value;
        // Hide the error message when the user starts typing
        this.showShortlistCountError = false;
    }

    handleFirstAtiDateChange(event) {
        this.firstAtiDate = event.target.value;
        // Hide the error message when the user starts typing
        this.showFirstAtiDateError = false;
    }

    handleAmountRefundedChange(event) {
        this.amountRefunded = event.target.value;
    }

    handleRefundsApprovedChange(event) {
        this.refundsApproved = event.target.value;
    }

    handleRefundNotesChange(event) {
      this.refundNotes = event.target.value;
    }


    handleCalculate() {
      console.log('Account Record Data:', this.accountRecord.data);
        // Check if any required fields are empty
        this.showShortlistsRequestedError = this.shortlistsRequested === 0;
        this.showTotalSumError = this.totalSum === 0;
        this.showShortlistCountError = this.shortlistCount === 0;
        this.showFirstAtiDateError = !this.firstAtiDate;

        // If any required fields are empty, stop the calculation
        if (
            this.showShortlistsRequestedError ||
            this.showTotalSumError ||
            this.showShortlistCountError ||
            this.showFirstAtiDateError
        ) {
            this.showResult = false;
            return;
        }

        // Get the refundRequestCount from the related Account record
        const refundRequestCount = getFieldValue(this.accountRecord.data, REFUNDS_APPROVED_COUNT);

        // Calculate the ratio
        const ratio = refundRequestCount === 0 ? 0 : refundRequestCount / this.shortlistCount;
        const ratioRounded = Math.round((ratio + Number.EPSILON) * 100) / 100;

        // Check/set tp experience
        const today = new Date();
        const atiDate = new Date(this.firstAtiDate);
        const daysDifference = Math.floor((today - atiDate) / (1000 * 60 * 60 * 24));
        const inexperienced = daysDifference < EXPERIENCE_DAYS || (daysDifference < 366 && this.shortlistCount < EXPERIENCE_SHORTLISTS);

        if (this.shortlistsRequested < MAX_SHORTLISTS) {
            if (inexperienced) {
                if (this.totalSum <= MAX_FEE) {
                    this.resultMessage = APPROVED_MESSAGE;
                    this.resultStyle = 'success-message';
                    this.resultReason = 'Inexperienced TP & total refund below £' + MAX_FEE + '.';
                    this.refundApproved = true;
                    this.refundsApproved = this.shortlistsRequested;
                    this.amountRefunded = this.totalSum;
                    this.refundDecisionOutcome = 'Approved';
                    this.refundDecisionReason = 'Inexperienced TP within params';
                } else {
                    this.resultMessage = HOLD_MESSAGE;
                    this.resultStyle = 'hold-message';
                    this.resultReason = 'Inexperienced TP, total refund over £' + MAX_FEE + '.';
                    this.refundDecisionOutcome = 'Hold & Call';
                    this.refundDecisionReason = 'Inexperienced TP refund amount over limit';
                }
            } else {
                if (this.totalSum <= MAX_FEE && ratioRounded <= RATIO_LOWER) {
                    this.resultMessage = APPROVED_MESSAGE;
                    this.resultStyle = 'success-message';
                    this.resultReason = 'Experienced TP, total refund below £' + MAX_FEE + ' & SL/Refund ratio ' + ratioRounded + '.';
                    this.refundApproved = true;
                    this.refundsApproved = this.shortlistsRequested;
                    this.amountRefunded = this.totalSum;
                    this.refundDecisionOutcome = 'Approved';
                    this.refundDecisionReason = 'Experienced TP within params';
                } else if (this.totalSum <= MAX_FEE && ratioRounded <= RATIO_UPPER) {
                    this.resultMessage = HOLD_MESSAGE;
                    this.resultStyle = 'hold-message';
                    this.resultReason = 'Experienced TP, ratio over ' + RATIO_LOWER + ', but not over ' + RATIO_UPPER + ': ' + ratioRounded;
                    this.refundDecisionOutcome = 'Hold & Call';
                    this.refundDecisionReason = 'Experienced TP ratio over lower limit';
                } else if (this.totalSum >= MAX_FEE && ratioRounded <= RATIO_UPPER) {
                    this.resultMessage = HOLD_MESSAGE;
                    this.resultStyle = 'hold-message';
                    this.resultReason = 'Experienced TP, total refund over £' + MAX_FEE + ' and ratio below ' + RATIO_UPPER + ': ' + ratioRounded;
                    this.refundDecisionOutcome = 'Hold & Call';
                    this.refundDecisionReason = 'Experienced TP refund amount over limit';
                } else {
                    this.resultMessage = DENIED_MESSAGE;
                    this.resultStyle = 'error-message';
                    this.resultReason = 'Experienced TP, ratio ' + ratioRounded + ' , over the limit of ' + RATIO_UPPER + '.';
                    this.refundDecisionOutcome = 'Denied';
                    this.refundDecisionReason = 'Experienced TP ratio over upper limit';
                }
            }
        } else {
            this.resultMessage = HOLD_MESSAGE;
            this.resultStyle = 'hold-message';
            this.resultReason = 'Requested ' + MAX_SHORTLISTS + ' or more refunds at once';
            this.refundDecisionOutcome = 'Hold & Call';
            this.refundDecisionReason = 'Number of shortlists requested over limit';
        }

        this.showResult = true;
    }

    handleUpdateCase() {

      const fieldsToUpdate = {};
      fieldsToUpdate['Id'] = this.recordId;
      fieldsToUpdate[CASE_REFUND_DECISION_FIELD.fieldApiName] = this.refundDecisionOutcome;
      fieldsToUpdate[CASE_REFUND_REASON_FIELD.fieldApiName] = this.refundDecisionReason;
      fieldsToUpdate[CASE_TYPE_FIELD.fieldApiName] = this.caseType; 
      fieldsToUpdate[CASE_AMOUNT_REFUNDED_FIELD.fieldApiName] = this.amountRefunded; 
      fieldsToUpdate[CASE_REFUND_FIELD.fieldApiName] = this.refundApproved; 
      fieldsToUpdate[CASE_REFUND_SL_REQ_FIELD.fieldApiName] = this.shortlistsRequested; 
      fieldsToUpdate[CASE_REFUND_REQUEST_TOTAL_FIELD.fieldApiName] = this.totalSum; 
      fieldsToUpdate[CASE_REFUND_NOTES_FIELD.fieldApiName] = this.refundNotes; 
      fieldsToUpdate[CASE_SLS_REFUNDED_FIELD.fieldApiName] = this.refundsApproved; 

      const recordInput = { fields: fieldsToUpdate };

      updateRecord(recordInput)
        .then(() => {
            this.showResult = false;
            this.showToast('Success', 'Record updated successfully', 'success');
            return refreshApex(this.caseRecord); // Refresh the wire adapter for the case record
        })
        .catch((error) => {
            console.error("Error updating record:", error);
            this.showToast('Error', 'An error occurred while updating the record', 'error');
        });


    }
}
