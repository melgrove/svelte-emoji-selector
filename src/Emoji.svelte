<script>
	import { createEventDispatcher } from 'svelte';

  export let emoji;
  
  const dispatch = createEventDispatcher();

  function onClick() {
    dispatch('emojiclick', emoji);
  }

  function onMouseOver() {
    dispatch('emojihover', emoji);
  }

  function onMouseOut() {
    dispatch('emojihover', null);
  }
</script>

<style>
  button {
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 1.3em;
    width: 3em;
    height: 3em;
    padding: 2em 1em 2em 1em;
    margin: 0;
  }

  button:hover {
    background: #E8F4F9;
    border-radius: 5px;
  }
</style>

<button on:mouseover={onMouseOver} on:mouseout={onMouseOut} on:click={onClick}>{emoji.emoji}</button>
