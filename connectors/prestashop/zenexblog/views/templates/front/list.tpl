{extends file='page.tpl'}

{block name='page_title'}{l s='Blog' mod='zenexblog'}{/block}

{block name='page_content'}
  {if $zenex_posts}
    <div class="zenexblog-list">
      {foreach from=$zenex_posts item=post}
        <article class="zenexblog-card">
          {if $post.cover}
            <a href="{$post.url}" class="zenexblog-card__cover"><img src="{$post.cover}" alt="{$post.cover_alt|default:$post.title}" loading="lazy"></a>
          {/if}
          <div class="zenexblog-card__body">
            <h2 class="zenexblog-card__title h3"><a href="{$post.url}">{$post.title}</a></h2>
            <p class="zenexblog-card__meta">{$post.date}</p>
            {if $post.excerpt}<p class="zenexblog-card__excerpt">{$post.excerpt}</p>{/if}
            <a href="{$post.url}" class="zenexblog-card__more">{l s='Read more' mod='zenexblog'}</a>
          </div>
        </article>
      {/foreach}
    </div>
    {if $zenex_pages > 1}
      <nav class="zenexblog-pagination">
        {if $zenex_prev}<a rel="prev" href="{$zenex_prev}">&larr; {l s='Newer' mod='zenexblog'}</a>{/if}
        <span>{$zenex_page} / {$zenex_pages}</span>
        {if $zenex_next}<a rel="next" href="{$zenex_next}">{l s='Older' mod='zenexblog'} &rarr;</a>{/if}
      </nav>
    {/if}
  {else}
    <p>{l s='No articles yet.' mod='zenexblog'}</p>
  {/if}
{/block}
