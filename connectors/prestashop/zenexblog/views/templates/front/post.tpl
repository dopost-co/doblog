{extends file='page.tpl'}

{block name='head_seo' append}
  {* The theme prints the title, description and URL tags; these complete them for articles. *}
  {if $zenex_post.cover}<meta property="og:image" content="{$zenex_post.cover}">{/if}
  <meta property="article:published_time" content="{$zenex_post.date_published|date_format:'%Y-%m-%dT%H:%M:%S'}">
{/block}

{block name='page_title'}{$zenex_post.title}{/block}

{block name='page_content'}
  <article class="zenexblog-post">
    <p class="zenexblog-post__meta">
      {$zenex_post.date}{if $zenex_post.author} · {$zenex_post.author}{/if}
    </p>
    {if $zenex_post.cover}
      <img class="zenexblog-post__cover" src="{$zenex_post.cover}" alt="{$zenex_post.cover_alt|default:$zenex_post.title}">
    {/if}
    <div class="zenexblog-post__content">{$zenex_post.content nofilter}</div>
    {if $zenex_post.tags}
      <p class="zenexblog-post__tags">{foreach from=$zenex_post.tags item=tag}<span>#{$tag.name}</span> {/foreach}</p>
    {/if}
    <p><a href="{$zenex_blog_url}">&larr; {l s='All articles' mod='zenexblog'}</a></p>
  </article>
{/block}
