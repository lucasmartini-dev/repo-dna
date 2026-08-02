<template>
  <div class="modal-overlay" data-test="confirm-modal">
    <div class="modal">
      <p>
        Do you really want to analyze the GitHub account of <strong>{{ username }}</strong
        >?
      </p>
      <div class="modal-actions">
        <button class="cancel" data-test="cancel" @click="$emit('cancel')">No</button>
        <button class="confirm" data-test="confirm" @click="$emit('confirm')">Yes</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ username: string }>();
defineEmits<{ (e: 'confirm'): void; (e: 'cancel'): void }>();
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal {
  background: white;
  padding: 24px;
  border-radius: 8px;
  max-width: 420px;
}
.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
